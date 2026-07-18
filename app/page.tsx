"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import type { WTerm } from "@wterm/dom";
import { CoreToggle } from "./core-toggle";
import { SessionTabs, type SessionTab } from "./session-tabs";
import "@wterm/react/css";

let counter = 0;
function nextSession(): SessionTab {
  counter += 1;
  return { id: `session-${counter}`, title: `Terminal ${counter}` };
}

function SessionView({
  session,
  debugEnabled,
}: {
  session: SessionTab;
  debugEnabled: boolean;
}) {
  const { ref, write } = useTerminal();
  const wsRef = useRef<WebSocket | null>(null);

  const handleReady = useCallback(
    (wt: WTerm) => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/api/terminal?session=${session.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(`\x1b[RESIZE:${wt.cols};${wt.rows}]`);
      };

      ws.onmessage = (event: MessageEvent) => {
        write(event.data as string);
      };

      ws.onclose = () => {
        write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
        wsRef.current = null;
      };
    },
    [session.id, write],
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

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <Terminal
      ref={ref}
      cols={80}
      rows={24}
      autoResize
      debug={debugEnabled}
      wasmUrl="/wterm.wasm"
      onReady={handleReady}
      onData={handleData}
      onResize={handleResize}
      className="h-full"
      style={{ borderRadius: 0, boxShadow: "none", padding: 0 }}
    />
  );
}

export default function LocalTerminal() {
  const [debugEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("debug"),
  );

  const [sessions, setSessions] = useState<SessionTab[]>(() => {
    const initial = nextSession();
    return [initial];
  });
  const [activeId, setActiveId] = useState<string>(
    () => sessions[0]?.id ?? "",
  );

  const addSession = useCallback(() => {
    const session = nextSession();
    setSessions((prev) => [...prev, session]);
    setActiveId(session.id);
  }, []);

  const closeSession = useCallback((id: string) => {
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
    <div className="flex h-screen flex-col">
      <CoreToggle />
      <div className="flex flex-1 overflow-hidden">
        <SessionTabs
          sessions={sessions}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeSession}
          onNew={addSession}
        />
        <div className="relative flex-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="absolute inset-0"
              style={{
                visibility: session.id === activeId ? "visible" : "hidden",
                pointerEvents: session.id === activeId ? "auto" : "none",
              }}
            >
              <SessionView
                session={session}
                debugEnabled={debugEnabled}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
