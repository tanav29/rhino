import { statSync } from "node:fs";
import type { AppRPC } from "../shared/rpc-schema";
import { getAvailableShells } from "./shells";

interface ShellProcess {
  pid: number;
  kill(): unknown;
  exited: Promise<unknown>;
}

interface PtySession {
  terminal: Bun.Terminal;
  proc: ShellProcess;
  decoder: TextDecoder;
  title: string;
  titleBuffer: string;
  outputBuffer: string;
  pendingOutput: string[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  finished: boolean;
}

const sessions = new Map<string, PtySession>();
const MAX_OUTPUT_BUFFER = 200_000;
const FLUSH_INTERVAL_MS = 8;
const ESC = String.fromCharCode(27);

export type SessionEvent =
  | { kind: "output"; sessionId: string; data: string }
  | { kind: "title"; sessionId: string; title: string }
  | { kind: "exit"; sessionId: string };

let eventSink: ((event: SessionEvent) => void) | null = null;
const subscribers = new Set<(event: SessionEvent) => void>();

export function subscribeSessionEvents(sink: (event: SessionEvent) => void) {
  subscribers.add(sink);
  return () => subscribers.delete(sink);
}

/** Registers the bridge that forwards PTY events to the webview. */
export function setSessionEventSink(sink: (event: SessionEvent) => void) {
  eventSink = sink;
}

function emit(event: SessionEvent) {
  eventSink?.(event);
  for (const sink of subscribers) sink(event);
}

type AttachParams = AppRPC["bun"]["requests"]["attachSession"]["params"];

function stripTerminalResponses(value: string) {
  return value.replace(new RegExp(`${ESC}\\[\\?[0-9;]*c|${ESC}\\[[0-9;]+R`, "g"), "");
}

function stripReplayControlSequences(value: string) {
  return stripTerminalResponses(value)
    .replace(/\^\[\[\?[0-9;]*c/g, "")
    .replace(new RegExp(`${ESC}\\[(?:[0-9]+;)?[356]n|${ESC}\\[(?:>|=)?c`, "g"), "");
}

/** Extracts OSC 0/1/2 title sequences from raw output chunks. */
function captureTitleChanges(state: PtySession, chunk: string): string[] {
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

function getWorkingDirectory(cwd?: string): string | undefined {
  const fallback =
    process.platform === "win32"
      ? process.env.USERPROFILE || process.cwd()
      : process.env.HOME || process.cwd();
  const candidate = cwd ? cwd : fallback;
  try {
    if (statSync(candidate).isDirectory()) return candidate;
  } catch {
    /* fall back for stale or inaccessible workspace paths */
  }
  return fallback;
}

function flushPending(id: string, session: PtySession) {
  session.flushTimer = null;
  if (!session.pendingOutput.length) return;
  const data = session.pendingOutput.join("");
  session.pendingOutput.length = 0;
  // Coalesced chunks keep the RPC bridge comfortable at high output rates.
  emit({ kind: "output", sessionId: id, data });
}

function scheduleFlush(id: string, session: PtySession) {
  if (session.flushTimer) return;
  session.flushTimer = setTimeout(() => flushPending(id, session), FLUSH_INTERVAL_MS);
}

function finishSession(id: string, session: PtySession) {
  if (session.finished) return;
  session.finished = true;
  if (session.flushTimer) {
    clearTimeout(session.flushTimer);
    session.flushTimer = null;
  }
  const tail = session.decoder.decode();
  if (tail) session.pendingOutput.push(tail);
  flushPending(id, session);
  try {
    session.terminal.close();
  } catch {
    /* already closed */
  }
  if (sessions.get(id) === session) sessions.delete(id);
  emit({ kind: "exit", sessionId: id });
}

export function attachSession({ sessionId, shell: shellValue, cwd, cols, rows }: AttachParams): {
  title: string;
  replay: string;
} {
  const existing = sessions.get(sessionId);
  if (existing) {
    return { title: existing.title, replay: stripReplayControlSequences(existing.outputBuffer) };
  }

  const { shell, args } = getShell(shellValue);
  const safeCwd = shellValue?.startsWith("ssh:") ? undefined : getWorkingDirectory(cwd);

  let terminal: Bun.Terminal | undefined;
  let proc: ShellProcess;
  try {
    // The PTY exists independently of the shell; the shell attaches to it.
    terminal = new Bun.Terminal({
      cols,
      rows,
      name: "xterm-256color",
      data(term, chunk) {
        const session = sessions.get(sessionId);
        if (!session || session.terminal !== term || session.finished) return;
        // Streaming decode handles multibyte sequences split across chunks.
        const text = session.decoder.decode(chunk, { stream: true });
        if (!text) return;
        session.outputBuffer = stripReplayControlSequences(
          (session.outputBuffer + text).slice(-MAX_OUTPUT_BUFFER),
        );
        session.pendingOutput.push(text);
        scheduleFlush(sessionId, session);
        const titles = captureTitleChanges(session, text);
        const title = titles[titles.length - 1];
        if (title && title !== session.title) {
          session.title = title;
          emit({ kind: "title", sessionId, title });
        }
      },
      exit(term) {
        const session = sessions.get(sessionId);
        if (session?.terminal === term) finishSession(sessionId, session);
      },
    });

    proc = Bun.spawn([shell, ...args], {
      terminal,
      cwd: safeCwd,
      stdin: "ignore",
    }) as unknown as ShellProcess;
  } catch (error) {
    terminal?.close();
    throw new Error(
      `Unable to spawn ${shell}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const session: PtySession = {
    terminal,
    proc,
    decoder: new TextDecoder("utf-8"),
    title: shell.split(/[\\/]/).pop() || shell,
    titleBuffer: "",
    outputBuffer: "",
    pendingOutput: [],
    flushTimer: null,
    finished: false,
  };
  sessions.set(sessionId, session);

  // Let the PTY drain its final data before closing it on process exit.
  void proc.exited.then(() => {
    setTimeout(() => {
      if (sessions.get(sessionId) === session) finishSession(sessionId, session);
    }, FLUSH_INTERVAL_MS * 4);
  });

  return { title: session.title, replay: "" };
}

export function writePtyInput(sessionId: string, data: string) {
  const session = sessions.get(sessionId);
  if (!session || session.finished) return;
  session.terminal.write(data);
}

export function resizePty(sessionId: string, cols: number, rows: number) {
  const session = sessions.get(sessionId);
  if (!session || session.finished) return;
  try {
    session.terminal.resize(cols, rows);
  } catch {
    /* the terminal can close between the check and the resize */
  }
}

export function killSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  try {
    session.proc.kill();
  } catch {
    /* already exited */
  }
  finishSession(sessionId, session);
}

export function killAllSessions() {
  // Copy the key set: killSession mutates the map during iteration.
  for (const id of Array.from(sessions.keys())) killSession(id);
}

/** Find known local coding agents among descendants of each terminal shell. */
export async function listAgents(): Promise<{ sessionId: string; name: string }[]> {
  if (!sessions.size) return [];
  try {
    const command =
      process.platform === "win32"
        ? [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
          ]
        : ["ps", "-axo", "pid=,ppid=,command="];
    const proc = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" });
    const output = await new Response(proc.stdout).text();
    if ((await proc.exited) !== 0) return [];
    let processes: { pid: number; parent: number; command: string }[];
    if (process.platform === "win32") {
      const data = JSON.parse(output || "[]");
      processes = (Array.isArray(data) ? data : [data]).map(
        (p: { ProcessId: number; ParentProcessId: number; CommandLine?: string }) => ({
          pid: p.ProcessId,
          parent: p.ParentProcessId,
          command: p.CommandLine || "",
        }),
      );
    } else {
      processes = output.split("\n").flatMap((line) => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
        return match
          ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] }]
          : [];
      });
    }
    const byPid = new Map(processes.map((p) => [p.pid, p]));
    const roots = new Map([...sessions].map(([id, session]) => [session.proc.pid, id]));
    const result: { sessionId: string; name: string }[] = [];
    for (const process of processes) {
      const match = process.command.match(
        /(?:^|[\s/\\"'])((?:claude|codex|gemini|opencode|aider|copilot))(?:\.exe|\.cmd|\.js)?(?=$|[\s"'])/i,
      );
      if (!match) continue;
      let parent = process.parent;
      const visited = new Set<number>();
      while (parent && !visited.has(parent)) {
        visited.add(parent);
        const sessionId = roots.get(parent);
        if (sessionId) {
          const name = match[1].toLowerCase();
          if (!result.some((item) => item.sessionId === sessionId && item.name === name))
            result.push({ sessionId, name });
          break;
        }
        parent = byPid.get(parent)?.parent ?? 0;
      }
    }
    return result;
  } catch {
    return [];
  }
}
