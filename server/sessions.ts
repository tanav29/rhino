import { execFileAsync } from "../lib/server-commands";
import { readdir } from "fs/promises";
import { isAbsolute, join, relative, resolve } from "path";
import { WebSocket } from "ws";
import * as pty from "node-pty";
import { getAvailableShells } from "../utils/shells";
import { IGNORED_DIR_NAMES } from "./env";

interface SessionPTY {
  pty: import("node-pty").IPty;
  clients: Set<WebSocket>;
  title: string;
  titleBuffer: string;
  createdAt: number;
}

const sessions = new Map<string, SessionPTY>();

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
  ptyProcess.onData((data) => {
    const titles = captureTitleChanges(session!, data);
    for (const c of session!.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(data);
    }
    if (titles.length > 0) {
      broadcastTitle(session!, titles[titles.length - 1]);
    }
  });
  ptyProcess.onExit(() => {
    for (const c of session!.clients) {
      if (c.readyState === WebSocket.OPEN) c.close();
    }
    session!.clients.clear();
    sessions.delete(id);
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
            !IGNORED_DIR_NAMES.has(entry.name)
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

export async function listProjectFiles(cwd: string): Promise<string[]> {
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

export function getSessions() {
  return sessions;
}

export function resolveWithinCwd(cwd: string, relPath: string): string | null {
  const resolved = resolve(cwd, relPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return resolved;
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
