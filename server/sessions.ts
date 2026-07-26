import { readFile, readdir, stat } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { WebSocket, WebSocketServer } from "ws";
import * as pty from "node-pty";
import { getAvailableShells } from "../utils/shells";
import { execFileAsync } from "../lib/server-commands";
import { randomBytes } from "crypto";
import { SessionPTY } from "./types";

const sessions = new Map<string, SessionPTY>();
const debugClients = new Set<WebSocket>();
let csrfToken = randomBytes(32).toString("hex");
let allowedOrigins: Set<string> | null = null;
let _dev = false;

export function getSessions() {
  return sessions;
}
export function getDebugClients() {
  return debugClients;
}
export function getCsrfToken() {
  return csrfToken;
}
export function setAllowedOrigins(o: Set<string>) {
  allowedOrigins = o;
}
export function getAllowedOrigins(): Set<string> {
  if (!allowedOrigins) {
    const p = parseInt(process.env.PORT || "4242", 10);
    allowedOrigins = new Set([
      `http://127.0.0.1:${p}`,
      `http://localhost:5173`,
      `http://127.0.0.1:5173`,
    ]);
  }
  return allowedOrigins;
}
export function setDevMode(d: boolean) {
  _dev = d;
}
export function isDevMode() {
  return _dev;
}
export function resetCsrfToken() {
  csrfToken = randomBytes(32).toString("hex");
}

function sendMessage(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

export function sessionsSnapshot() {
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

export function broadcastDebug() {
  const snap = sessionsSnapshot();
  for (const c of debugClients) sendMessage(c, snap);
}

export function broadcastTitle(session: SessionPTY, title: string) {
  if (!title || title === session.title) return;
  session.title = title;
  for (const c of session.clients) sendMessage(c, { type: "title", title });
}

export function captureTitleChanges(state: SessionPTY, chunk: string): string[] {
  const buffer = state.titleBuffer + chunk;
  const titles: string[] = [];
  let cursor = 0,
    lastCompleteEnd = 0,
    partialStart = -1;
  while (cursor < buffer.length) {
    const start = buffer.indexOf("\x1b]", cursor);
    if (start === -1) break;
    const sep = buffer.indexOf(";", start + 2);
    if (sep === -1) {
      partialStart = start;
      break;
    }
    const code = buffer.slice(start + 2, sep);
    if (code !== "0" && code !== "1" && code !== "2") {
      cursor = sep + 1;
      continue;
    }
    const bell = buffer.indexOf("\x07", sep + 1);
    const st = buffer.indexOf("\x1b\\", sep + 1);
    if (bell === -1 && st === -1) {
      partialStart = start;
      break;
    }
    const useBell = bell !== -1 && (st === -1 || bell < st);
    const endIdx = useBell ? bell : st;
    titles.push(buffer.slice(sep + 1, endIdx));
    cursor = endIdx + (useBell ? 1 : 2);
    lastCompleteEnd = cursor;
  }
  state.titleBuffer =
    partialStart >= 0
      ? buffer.slice(partialStart)
      : buffer.slice(Math.max(lastCompleteEnd, buffer.length - 2));
  if (state.titleBuffer.length > 4096) state.titleBuffer = state.titleBuffer.slice(-1024);
  return titles;
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
    const pm = target.match(/^(.*):(\d+)$/);
    return {
      shell: process.platform === "win32" ? "ssh.exe" : "ssh",
      args: pm ? ["-p", pm[2], pm[1]] : [target],
    };
  }
  if (shellValue) {
    const s = getAvailableShells().find((sh) => sh.value === shellValue);
    if (s) return { shell: s.value, args: s.args };
  }
  if (process.platform === "win32")
    return { shell: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", args: [] };
  return { shell: process.env.SHELL || "/bin/zsh", args: ["-l"] };
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
      : cwd ||
        (process.platform === "win32"
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
    for (const c of session!.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(data);
    }
    if (titles.length > 0) {
      broadcastTitle(session!, titles[titles.length - 1]);
      broadcastDebug();
    }
  });
  ptyProcess.onExit(() => {
    for (const c of session!.clients) {
      if (c.readyState === WebSocket.OPEN) c.close();
    }
    session!.clients.clear();
    sessions.delete(id);
    broadcastDebug();
  });
  return session;
}

async function listFilesFallback(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, prefix: string) {
    if (results.length >= 20000) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        if (results.length >= 20000 || entry.name === ".git") return;
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (
            ![
              "node_modules",
              ".git",
              "dist",
              "build",
              "out",
              ".next",
              ".nuxt",
              "target",
              "venv",
              ".venv",
              "__pycache__",
              ".cache",
              "coverage",
            ].includes(entry.name)
          ) {
            await walk(join(dir, entry.name), relPath);
          }
        } else if (entry.isFile() && results.length < 20000) {
          results.push(relPath);
        }
      }),
    );
  }
  await walk(root, "");
  return results;
}

async function listProjectFiles(cwd: string): Promise<string[]> {
  try {
    const result = await execFileAsync(
      "git",
      ["-C", cwd, "ls-files", "-co", "--exclude-standard"],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
    );
    const files = result.stdout
      .split("\n")
      .reduce<string[]>((acc, line) => {
        const t = line.trim();
        if (t) acc.push(t.replace(/\\/g, "/"));
        return acc;
      }, [])
      .slice(0, 20000);
    if (files.length) return files;
  } catch {
    /* not a git repo */
  }
  return listFilesFallback(cwd);
}

export function resolveWithinCwd(cwd: string, relPath: string): string | null {
  const resolved = resolve(cwd, relPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return resolved;
}

export async function handleFileBrowse(requested: string | null) {
  const home =
    process.platform === "win32" ? process.env.USERPROFILE || "C:\\" : process.env.HOME || "/";
  const resolved = resolve(requested || home);
  try {
    const dirents = await readdir(resolved, { withFileTypes: true });
    const entries = dirents
      .reduce<{ name: string; path: string }[]>((r, e) => {
        if (e.isDirectory() && !e.name.startsWith("."))
          r.push({ name: e.name, path: join(resolved, e.name) });
        return r;
      }, [])
      .sort((a, b) => a.name.localeCompare(b.name));
    const parent = dirname(resolved);
    return { path: resolved, parent: parent === resolved ? null : parent, entries };
  } catch (error) {
    return {
      path: resolved,
      parent: null,
      entries: [],
      error: error instanceof Error ? error.message : "Unable to read directory",
    };
  }
}

export async function handleGitStatus(cwd: string): Promise<string> {
  const result = await execFileAsync("git", ["-C", cwd, "status", "--short", "--branch"], {
    windowsHide: true,
  });
  return result.stdout || "Working tree clean";
}

export async function handleListFiles(cwd: string) {
  const paths = await listProjectFiles(cwd);
  return { paths };
}

export async function handleReadFile(cwd: string, relPath: string) {
  const resolved = resolveWithinCwd(cwd, relPath);
  if (!resolved) return { error: "Invalid path" };
  try {
    const stats = await stat(resolved);
    if (!stats.isFile()) throw new Error("Not a file");
    if (stats.size > 2_000_000) return { error: "File is too large to preview" };
    const buffer = await readFile(resolved);
    if (buffer.subarray(0, 8000).includes(0)) return { error: "Binary file cannot be previewed" };
    return { contents: buffer.toString("utf-8") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to read file" };
  }
}

export async function handleGitDiff(cwd: string, relPath: string) {
  const resolved = resolveWithinCwd(cwd, relPath);
  if (!resolved) return { error: "Invalid path" };
  try {
    const statusResult = await execFileAsync(
      "git",
      ["-C", cwd, "status", "--porcelain=1", "--untracked-files=all", "--", relPath],
      { windowsHide: true },
    );
    const statusLine = statusResult.stdout.split("\n").find(Boolean) ?? "";
    if (statusLine.startsWith("??")) {
      const contents = await readFile(resolved, "utf-8");
      return { kind: "added", contents };
    }
    let patch = "";
    for (const args of [
      ["diff", "HEAD", "--", relPath],
      ["diff", "--cached", "--", relPath],
      ["diff", "--", relPath],
    ]) {
      try {
        const result = await execFileAsync("git", ["-C", cwd, ...args], {
          windowsHide: true,
          maxBuffer: 20 * 1024 * 1024,
        });
        if (result.stdout.trim()) {
          patch = result.stdout;
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!patch) return { kind: "empty" };
    return { kind: "diff", patch };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to diff file" };
  }
}

export function handlePTYConnection(
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
      const m = input.match(/\x1b\[RESIZE:(\d+);(\d+)\]/);
      if (m) {
        const cols = parseInt(m[1], 10),
          rows = parseInt(m[2], 10);
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

export function attachDebugClient(ws: WebSocket) {
  debugClients.add(ws);
  sendMessage(ws, sessionsSnapshot());
  ws.on("close", () => {
    debugClients.delete(ws);
  });
}
