import { createServer } from "http";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { getAvailableShells } from "./utils/shells";
import { execFile } from "child_process";
import { promisify } from "util";

const hostname = process.env.HOST || "127.0.0.1";
const vitePort = 5173;
const execFileAsync = promisify(execFile);

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
  const server = createServer(async (req, res) => {
    const reqUrl = new URL(req.url || "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": `http://localhost:${vitePort}`,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (reqUrl.pathname === "/api/sessions") {
      writeJson(res, 200, sessionsSnapshot(), dev);
      return;
    }

    if (reqUrl.pathname === "/api/shells") {
      writeJson(res, 200, getAvailableShells(), dev);
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
    const upUrl = new URL(req.url || "/", "http://localhost");
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
