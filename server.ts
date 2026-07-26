import { createServer } from "http";
import { readFile, readdir, stat } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { getAvailableShells } from "./utils/shells";
import { randomBytes } from "crypto";
import { execFileAsync } from "./lib/server-commands";

const hostname = process.env.HOST || "127.0.0.1";
const vitePort = 5173;
const MAX_PREVIEW_FILE_SIZE = 2_000_000;
const MAX_LISTED_FILES = 20000;
const IGNORED_DIR_NAMES = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  "target", "venv", ".venv", "__pycache__", ".cache", "coverage",
]);

async function listFilesFallback(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, prefix: string) {
    if (results.length >= MAX_LISTED_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      if (results.length >= MAX_LISTED_FILES || entry.name === ".git") return;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORED_DIR_NAMES.has(entry.name)) await walk(join(dir, entry.name), relPath);
      } else if (entry.isFile() && results.length < MAX_LISTED_FILES) {
        results.push(relPath);
      }
    }));
  }
  await walk(root, "");
  return results;
}

async function listProjectFiles(cwd: string): Promise<string[]> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, "ls-files", "-co", "--exclude-standard"], {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    const files = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((p) => p.replace(/\\/g, "/"));
    if (files.length) return files.slice(0, MAX_LISTED_FILES);
  } catch {
    // not a git repo, or git unavailable — fall back to a manual walk
  }
  return listFilesFallback(cwd);
}

function resolveWithinCwd(cwd: string, relPath: string): string | null {
  const resolved = resolve(cwd, relPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return resolved;
}

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return env;
}

function getShell(shellValue?: string): { shell: string; args: string[] } {
  if (shellValue?.startsWith("ssh:")) {
    const target = shellValue.slice(4).trim();
    const portMatch = target.match(/^(.*):(\d+)$/);
    return {
      shell: process.platform === "win32" ? "ssh.exe" : "ssh",
      args: portMatch ? ["-p", portMatch[2], portMatch[1]] : [target],
    };
  }
  if (shellValue) {
    const selectedShell = getAvailableShells().find(
      (availableShell) => availableShell.value === shellValue,
    );
    if (selectedShell) {
      return { shell: selectedShell.value, args: selectedShell.args };
    }
  }

  if (process.platform === "win32") {
    const shell = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    return { shell, args: [] };
  }
  return { shell: process.env.SHELL || "/bin/zsh", args: ["-l"] };
}

interface SessionPTY {
  pty: pty.IPty;
  clients: Set<WebSocket>;
  title: string;
  titleBuffer: string;
  createdAt: number;
}

const sessions = new Map<string, SessionPTY>();
const debugClients = new Set<WebSocket>();

function sendMessage(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sessionsSnapshot() {
  const now = Date.now();
  return {
    count: sessions.size,
    sessions: Array.from(sessions.entries()).map(([id, s]) => ({
      id,
      title: s.title,
      clients: s.clients.size,
      createdAt: s.createdAt ?? now,
    })),
  };
}

function broadcastDebug() {
  const snapshot = sessionsSnapshot();
  for (const client of debugClients) {
    sendMessage(client, snapshot);
  }
}

function broadcastTitle(session: SessionPTY, title: string) {
  if (!title || title === session.title) return;
  session.title = title;
  const message = { type: "title" as const, title };
  for (const client of session.clients) {
    sendMessage(client, message);
  }
}

function captureTitleChanges(state: SessionPTY, chunk: string): string[] {
  const buffer = state.titleBuffer + chunk;
  const titles: string[] = [];
  let cursor = 0;
  let lastCompleteEnd = 0;
  let partialStart = -1;

  while (cursor < buffer.length) {
    const start = buffer.indexOf("\x1b]", cursor);
    if (start === -1) break;

    const separator = buffer.indexOf(";", start + 2);
    if (separator === -1) {
      partialStart = start;
      break;
    }

    const code = buffer.slice(start + 2, separator);
    if (code !== "0" && code !== "1" && code !== "2") {
      cursor = separator + 1;
      continue;
    }

    const bell = buffer.indexOf("\x07", separator + 1);
    const st = buffer.indexOf("\x1b\\", separator + 1);
    if (bell === -1 && st === -1) {
      partialStart = start;
      break;
    }

    const useBell = bell !== -1 && (st === -1 || bell < st);
    const endIdx = useBell ? bell : st;
    titles.push(buffer.slice(separator + 1, endIdx));
    cursor = endIdx + (useBell ? 1 : 2);
    lastCompleteEnd = cursor;
  }

  state.titleBuffer =
    partialStart >= 0
      ? buffer.slice(partialStart)
      : buffer.slice(Math.max(lastCompleteEnd, buffer.length - 2));
  if (state.titleBuffer.length > 4096) {
    state.titleBuffer = state.titleBuffer.slice(-1024);
  }

  return titles;
}

function getOrCreateSession(
  id: string,
  cols: number,
  rows: number,
  shellValue?: string,
  cwd?: string,
): SessionPTY {
  let session = sessions.get(id);
  if (session) return session;

  const { shell, args } = getShell(shellValue);
  const ptyProcess = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols,
    rows,
    useConptyDll: true,
    cwd: shellValue?.startsWith("ssh:")
      ? undefined
      : cwd || (process.platform === "win32"
        ? process.env.USERPROFILE || "C:\\"
        : process.env.HOME || "/"),
    env: cleanEnv(),
  });

  session = {
    pty: ptyProcess,
    clients: new Set(),
    title: ptyProcess.process,
    titleBuffer: "",
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  broadcastDebug();

  ptyProcess.onData((data) => {
    const titles = captureTitleChanges(session!, data);
    for (const client of session!.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
    if (titles.length > 0) {
      broadcastTitle(session!, titles[titles.length - 1]);
      broadcastDebug();
    }
  });

  ptyProcess.onExit(() => {
    for (const client of session!.clients) {
      if (client.readyState === WebSocket.OPEN) client.close();
    }
    session!.clients.clear();
    sessions.delete(id);
    broadcastDebug();
  });

  return session;
}

function handlePTYConnection(
  ws: WebSocket,
  sessionId?: string,
  shellValue?: string,
  cwd?: string,
) {
  const id = sessionId || "default";
  let session: SessionPTY | null = null;
  let initialized = false;

  ws.on("message", (msg: Buffer | string) => {
    const input = typeof msg === "string" ? msg : msg.toString("utf-8");

    if (input === "\x1b[CLOSE]") {
      if (session) {
        session.clients.delete(ws);
        session.pty.kill();
        sessions.delete(id);
      }
      ws.close();
      return;
    }

    if (input.startsWith("\x1b[RESIZE:")) {
      const match = input.match(/\x1b\[RESIZE:(\d+);(\d+)\]/);
      if (match) {
        const cols = parseInt(match[1], 10);
        const rows = parseInt(match[2], 10);
        if (!session) {
          session = getOrCreateSession(id, cols, rows, shellValue, cwd);
          attach(session);
        } else {
          session.pty.resize(cols, rows);
        }
        return;
      }
    }

    if (session) session.pty.write(input);
  });

  function attach(s: SessionPTY) {
    if (initialized) return;
    initialized = true;
    session = s;
    s.clients.add(ws);
    sendMessage(ws, { type: "title", title: s.title });
  }

  ws.on("close", () => {
    if (session) session.clients.delete(ws);
  });
}

function writeJson(res: any, status: number, data: unknown, development: boolean) {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": development ? `http://localhost:${vitePort}` : undefined,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  });
  res.end(json);
}

function getRequestOrigin(req: import("http").IncomingMessage): string | null {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return null;
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return null;
  }
}

function createCsrfToken() {
  return randomBytes(32).toString("hex");
}

export async function startServer(options: {
  hostname?: string;
  port?: number;
  staticDir?: string;
  development?: boolean;
} = {}) {
  const serverHostname = options.hostname ?? hostname;
  const serverPort = options.port ?? parseInt(process.env.PORT || "4242", 10);
  const dev = options.development ?? process.env.NODE_ENV !== "production";
  const staticDir = options.staticDir ?? resolve(process.cwd(), "dist");
  const csrfToken = createCsrfToken();
  const allowedOrigins = new Set([
    `http://${serverHostname}:${serverPort}`,
    `http://localhost:${vitePort}`,
    `http://127.0.0.1:${vitePort}`,
  ]);
  const server = createServer(async (req, res) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host ?? `${serverHostname}:${serverPort}`}`);

    if (reqUrl.pathname === "/api/csrf" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ token: csrfToken }));
      return;
    }

    if (req.method === "OPTIONS") {
      const origin = getRequestOrigin(req);
      if (!origin || !allowedOrigins.has(origin)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Wterm-CSRF",
        Vary: "Origin",
      });
      res.end();
      return;
    }

    if (reqUrl.pathname.startsWith("/api/")) {
      const origin = getRequestOrigin(req);
      if (!origin || !allowedOrigins.has(origin) || req.headers["x-wterm-csrf"] !== csrfToken) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return;
      }
    }

    if (reqUrl.pathname === "/api/sessions") {
      writeJson(res, 200, sessionsSnapshot(), dev);
      return;
    }

    if (reqUrl.pathname === "/api/shells") {
      writeJson(res, 200, getAvailableShells(), dev);
      return;
    }

    if (reqUrl.pathname === "/api/browse") {
      const requested = reqUrl.searchParams.get("path")?.trim();
      const home = process.platform === "win32" ? process.env.USERPROFILE || "C:\\" : process.env.HOME || "/";
      const resolved = resolve(requested || home);
      try {
        const dirents = await readdir(resolved, { withFileTypes: true });
        const entries = dirents.reduce<{ name: string; path: string }[]>((result, entry) => {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            result.push({ name: entry.name, path: join(resolved, entry.name) });
          }
          return result;
        }, []).sort((a, b) => a.name.localeCompare(b.name));
        const parent = dirname(resolved);
        writeJson(res, 200, { path: resolved, parent: parent === resolved ? null : parent, entries }, dev);
      } catch (error) {
        writeJson(res, 200, { path: resolved, parent: null, entries: [], error: error instanceof Error ? error.message : "Unable to read directory" }, dev);
      }
      return;
    }

    if (reqUrl.pathname === "/api/git/status") {
      try {
        const cwd = reqUrl.searchParams.get("cwd") || process.cwd();
        const result = await execFileAsync("git", ["-C", cwd, "status", "--short", "--branch"], { windowsHide: true });
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(result.stdout || "Working tree clean");
      } catch (error) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(error instanceof Error ? error.message : "Git unavailable");
      }
      return;
    }

    if (reqUrl.pathname === "/api/files") {
      const cwd = resolve(reqUrl.searchParams.get("cwd") || process.cwd());
      try {
        const paths = await listProjectFiles(cwd);
        writeJson(res, 200, { paths }, dev);
      } catch (error) {
        writeJson(res, 200, { paths: [], error: error instanceof Error ? error.message : "Unable to list files" }, dev);
      }
      return;
    }

    if (reqUrl.pathname === "/api/file") {
      const cwd = resolve(reqUrl.searchParams.get("cwd") || process.cwd());
      const relPath = reqUrl.searchParams.get("path") || "";
      const resolved = resolveWithinCwd(cwd, relPath);
      if (!resolved) {
        writeJson(res, 400, { error: "Invalid path" }, dev);
        return;
      }
      try {
        const stats = await stat(resolved);
        if (!stats.isFile()) throw new Error("Not a file");
        if (stats.size > MAX_PREVIEW_FILE_SIZE) {
          writeJson(res, 200, { error: "File is too large to preview" }, dev);
          return;
        }
        const buffer = await readFile(resolved);
        if (buffer.subarray(0, 8000).includes(0)) {
          writeJson(res, 200, { error: "Binary file cannot be previewed" }, dev);
          return;
        }
        writeJson(res, 200, { contents: buffer.toString("utf-8") }, dev);
      } catch (error) {
        writeJson(res, 200, { error: error instanceof Error ? error.message : "Unable to read file" }, dev);
      }
      return;
    }

    if (reqUrl.pathname === "/api/git/diff") {
      const cwd = resolve(reqUrl.searchParams.get("cwd") || process.cwd());
      const relPath = reqUrl.searchParams.get("path") || "";
      const resolved = resolveWithinCwd(cwd, relPath);
      if (!resolved) {
        writeJson(res, 400, { error: "Invalid path" }, dev);
        return;
      }
      try {
        const statusResult = await execFileAsync("git", ["-C", cwd, "status", "--porcelain=1", "--untracked-files=all", "--", relPath], { windowsHide: true });
        const statusLine = statusResult.stdout.split("\n").find(Boolean) ?? "";
        if (statusLine.startsWith("??")) {
          const contents = await readFile(resolved, "utf-8");
          writeJson(res, 200, { kind: "added", contents }, dev);
          return;
        }
        let patch = "";
        for (const args of [["diff", "HEAD", "--", relPath], ["diff", "--cached", "--", relPath], ["diff", "--", relPath]]) {
          try {
            const result = await execFileAsync("git", ["-C", cwd, ...args], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
            if (result.stdout.trim()) { patch = result.stdout; break; }
          } catch {
            // try the next diff strategy
          }
        }
        if (!patch) {
          writeJson(res, 200, { kind: "empty" }, dev);
          return;
        }
        writeJson(res, 200, { kind: "diff", patch }, dev);
      } catch (error) {
        writeJson(res, 200, { error: error instanceof Error ? error.message : "Unable to diff file" }, dev);
      }
      return;
    }

    if (dev) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const pathname = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname || "/index.html";
    try {
      const file = await readFile(resolve(staticDir, `.${pathname}`));
      res.writeHead(200, { "Content-Type": pathname.endsWith(".html") ? "text/html" : "application/octet-stream" });
      res.end(file);
    } catch {
      const file = await readFile(resolve(staticDir, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(file);
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const upUrl = new URL(req.url || "/", `http://${req.headers.host ?? `${serverHostname}:${serverPort}`}`);
    const origin = getRequestOrigin(req);
    if (!origin || !allowedOrigins.has(origin) || (req.headers["x-wterm-csrf"] !== csrfToken && upUrl.searchParams.get("csrf") !== csrfToken)) {
      socket.destroy();
      return;
    }
    const pathname = upUrl.pathname;

    if (pathname === "/api/terminal") {
      const sessionId = upUrl.searchParams.get("session") ?? undefined;
      wss.handleUpgrade(req, socket, head, (ws) => {
        const shellValue = upUrl.searchParams.get("shell") ?? undefined;
        handlePTYConnection(ws, sessionId, shellValue, upUrl.searchParams.get("cwd") ?? undefined);
      });
    } else if (pathname === "/api/debug") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        debugClients.add(ws);
        sendMessage(ws, sessionsSnapshot());
        ws.on("close", () => {
          debugClients.delete(ws);
        });
      });
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(serverPort, serverHostname, () => resolveListen());
  });

  server.on("close", () => {
    for (const session of sessions.values()) session.pty.kill();
    sessions.clear();
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : serverPort;
  console.log(`> Local Terminal ready on http://${serverHostname}:${actualPort}`);
  return { server, port: actualPort };
}

if (process.argv[1]?.endsWith("server.ts")) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
