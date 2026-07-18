"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import type { WTerm, TerminalCore } from "@wterm/dom";
import { GhosttyCore } from "@wterm/ghostty";
import { SessionTabs, type SessionTab } from "./session-tabs";
import { DebugToolbar } from "./debug-toolbar";
import "@wterm/react/css";

let counter = 0;
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function nextSession(): SessionTab {
  counter += 1;
  return { id: uuid(), title: `Terminal ${counter}` };
}

const STORAGE_KEY = "wterm.sessions";

function loadSessions(): SessionTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return [nextSession()];
}

function saveSessions(sessions: SessionTab[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore quota errors
  }
}

const sessionSockets = new Map<string, WebSocket>();

type TitleMessage = {
  type: "title";
  title: string;
};

function isTitleMessage(value: unknown): value is TitleMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as TitleMessage).type === "title" &&
    typeof (value as TitleMessage).title === "string"
  );
}

function SessionView({
  session,
  debugEnabled,
  onTitle,
}: {
  session: SessionTab;
  debugEnabled: boolean;
  onTitle: (id: string, title: string) => void;
}) {
  const { ref, write } = useTerminal();
  const [core, setCore] = useState<TerminalCore | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const coreLoadRef = useRef<Promise<TerminalCore> | null>(null);

  useEffect(() => {
    // React Strict Mode can run effects twice. Keep one load per view so a
    // second core cannot replace the terminal while its first socket lives.
    if (!coreLoadRef.current) {
      coreLoadRef.current = GhosttyCore.load({ wasmPath: "/ghostty-vt.wasm" });
    }
    let cancelled = false;
    coreLoadRef.current.then((loadedCore) => {
      if (!cancelled) setCore(loadedCore);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReady = useCallback(
    (wt: WTerm) => {
      // A callback ref can be replaced while the view is still mounted.
      // Never leave an older socket feeding the same terminal instance.
      const previous = wsRef.current;
      if (previous) {
        previous.close();
        wsRef.current = null;
      }

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/api/terminal?session=${session.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      sessionSockets.set(session.id, ws);

      ws.onopen = () => {
        ws.send(`\x1b[RESIZE:${wt.cols};${wt.rows}]`);
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = event.data as string;
        try {
          const parsed = JSON.parse(data) as unknown;
          if (isTitleMessage(parsed)) {
            onTitle(session.id, parsed.title);
            return;
          }
        } catch {
          // fall through to raw write
        }
        write(data);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
        }
      };
    },
    [onTitle, session.id, write],
  );

  const handleData = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const handleResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(`\x1b[RESIZE:${cols};${rows}]`);
    }
  }, []);

  const handleTitle = useCallback(
    (title: string) => {
      onTitle(session.id, title);
    },
    [onTitle, session.id],
  );

  useEffect(() => {
    return () => {
      const ws = sessionSockets.get(session.id);
      sessionSockets.delete(session.id);
      ws?.close();
    };
  }, [session.id]);

  if (!core) return null;

  return (
    <Terminal
      ref={ref}
      cols={80}
      rows={24}
      autoResize
      debug={debugEnabled}
      core={core}
      wasmUrl="/wterm.wasm"
      onReady={handleReady}
      onData={handleData}
      onResize={handleResize}
      onTitle={handleTitle}
      className="h-full min-h-0"
      style={{
        borderRadius: 0,
        boxShadow: "none",
        padding: 8,
        boxSizing: "border-box",
        fontFamily: "var(--font-mono, Menlo, Consolas, monospace)",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        overflowX: "hidden",
        overflowY: "auto",
      }}
    />
  );
}

export default function LocalTerminal() {
  const [debugEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("debug"),
  );

  const [sessions, setSessions] = useState<SessionTab[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string>(() => sessions[0]?.id ?? "");

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const addSession = useCallback(() => {
    const session = nextSession();
    setSessions((prev) => [...prev, session]);
    setActiveId(session.id);
  }, []);

  const updateTitle = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s)),
    );
  }, []);

  const closeSession = useCallback((id: string) => {
    const ws = sessionSockets.get(id);
    sessionSockets.delete(id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send("\x1b[CLOSE]");
      ws.close();
    } else {
      ws?.close();
    }
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const session = nextSession();
        setActiveId(session.id);
        return [session];
      }
      setActiveId((current) =>
        current === id ? next[next.length - 1].id : current,
      );
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <SessionTabs
        sessions={sessions}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closeSession}
        onNew={addSession}
      />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="absolute inset-0"
            style={{
              visibility: session.id === activeId ? "visible" : "hidden",
              pointerEvents: session.id === activeId ? "auto" : "none",
            }}>
            <SessionView
              session={session}
              debugEnabled={debugEnabled}
              onTitle={updateTitle}
            />
          </div>
        ))}
      </div>
      {debugEnabled && <DebugToolbar />}
    </div>
  );
}
