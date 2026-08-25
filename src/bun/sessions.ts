import { statSync } from "node:fs";
import type { AppRPC } from "../shared/rpc-schema";
import { getAvailableShells } from "./shells";

interface ShellProcess {
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

/** Registers the bridge that forwards PTY events to the webview. */
export function setSessionEventSink(sink: (event: SessionEvent) => void) {
  eventSink = sink;
}

function emit(event: SessionEvent) {
  eventSink?.(event);
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
  try {
    session.terminal.close();
  } catch {
    /* already closed */
  }
  sessions.delete(id);
  emit({ kind: "exit", sessionId: id });
}

export function attachSession({
  sessionId,
  shell: shellValue,
  cwd,
  cols,
  rows,
}: AttachParams): { title: string; replay: string } {
  const existing = sessions.get(sessionId);
  if (existing) {
    return { title: existing.title, replay: stripReplayControlSequences(existing.outputBuffer) };
  }

  const { shell, args } = getShell(shellValue);
  const safeCwd = shellValue?.startsWith("ssh:") ? undefined : getWorkingDirectory(cwd);

  let terminal: Bun.Terminal;
  let proc: ShellProcess;
  try {
    // The PTY exists independently of the shell; the shell attaches to it.
    terminal = new Bun.Terminal({
      cols,
      rows,
      name: "xterm-256color",
      data(term, chunk) {
        const session = sessions.get(sessionId);
        if (!session) return;
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
      exit() {
        const session = sessions.get(sessionId);
        if (session) finishSession(sessionId, session);
      },
    });

    proc = Bun.spawn([shell, ...args], {
      terminal,
      cwd: safeCwd,
      stdin: "ignore",
    }) as unknown as ShellProcess;
  } catch (error) {
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

  // Belt and braces: the subprocess may die while the PTY stays open.
  void proc.exited.then(() => {
    const current = sessions.get(sessionId);
    if (current) finishSession(sessionId, current);
  });

  return { title: session.title, replay: "" };
}

export function writePtyInput(sessionId: string, data: string) {
  const session = sessions.get(sessionId);
  if (!session || session.finished) return;
  session.terminal.write(stripTerminalResponses(data));
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
