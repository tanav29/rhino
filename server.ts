import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { getAvailableShells } from "./utils/shells";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "127.0.0.1";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port, turbopack: dev });
const handle = app.getRequestHandler();

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return env;
}

function getShell(shellValue?: string): { shell: string; args: string[] } {
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
): SessionPTY {
  let session = sessions.get(id);
  if (session) return session;

  const { shell, args } = getShell(shellValue);
  const ptyProcess = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd:
      process.platform === "win32"
        ? process.env.USERPROFILE || "C:\\"
        : process.env.HOME || "/",
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
          session = getOrCreateSession(id, cols, rows, shellValue);
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

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || "/", true);

    if (parsedUrl.pathname === "/api/sessions") {
      const now = Date.now();
      const list = Array.from(sessions.entries()).map(([id, s]) => ({
        id,
        title: s.title,
        clients: s.clients.size,
        createdAt: (s as any).createdAt ?? now,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ count: sessions.size, sessions: list }));
      return;
    }

    if (parsedUrl.pathname === "/api/shells") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getAvailableShells()));
      return;
    }

    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url || "/", true);

    if (pathname === "/api/terminal") {
      const sessionId =
        typeof query.session === "string" ? query.session : undefined;
      wss.handleUpgrade(req, socket, head, (ws) => {
        const shellValue =
          typeof query.shell === "string" ? query.shell : undefined;
        handlePTYConnection(ws, sessionId, shellValue);
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
      app.getUpgradeHandler()(req, socket, head);
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Local Terminal ready on http://${hostname}:${port}`);
  });
});
