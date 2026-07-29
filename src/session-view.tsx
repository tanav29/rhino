import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import { GhosttyCore } from "@wterm/ghostty";
import type { SessionTab } from "./session-tabs";
import { sessionSockets } from "./session-sockets";
import { apiBase } from "./api-base";

type TitleMessage = {
  type: "title";
  title: string;
};

const ESC = String.fromCharCode(27);

function isTitleMessage(value: unknown): value is TitleMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as TitleMessage).type === "title" &&
    typeof (value as TitleMessage).title === "string"
  );
}

function isTerminalResponse(value: string) {
  return (
    (value.startsWith(`${ESC}[?`) && /^\[\?[0-9;]*c$/.test(value.slice(1))) ||
    (value.startsWith(`${ESC}[`) && /^\[[0-9;]+R$/.test(value.slice(1)))
  );
}

export function SessionView({
  session,
  onTitle,
  active = true,
  visible = true,
}: {
  session: SessionTab;
  onTitle: (id: string, title: string) => void;
  active?: boolean;
  visible?: boolean;
}) {
  const { ref, write, focus } = useTerminal();
  const [core, setCore] = useState<GhosttyCore | null>(null);
  const [ready, setReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onTitleRef = useRef(onTitle);

  useEffect(() => {
    let cancelled = false;
    void GhosttyCore.load().then((loadedCore) => {
      if (!cancelled) setCore(loadedCore);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onTitleRef.current = onTitle;
  }, [onTitle]);

  useLayoutEffect(() => {
    if (visible && active) focus();
  }, [active, focus, visible]);

  useEffect(() => {
    if (!core || !ready) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    const maxReconnectDelay = 30000;

    function sendResize() {
      const terminal = ref.current?.instance;
      if (wsRef.current?.readyState === WebSocket.OPEN && terminal) {
        wsRef.current.send(`\x1b[RESIZE:${terminal.cols};${terminal.rows}]`);
      }
    }

    function connect() {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = apiBase ? "localhost:4242" : window.location.host;
      const shellQuery = session.shell
        ? `&shell=${encodeURIComponent(session.shell)}`
        : "";
      const cwdQuery = session.cwd
        ? `&cwd=${encodeURIComponent(session.cwd)}`
        : "";
      const wsUrl = `${proto}//${wsHost}/api/terminal?session=${session.id}${shellQuery}${cwdQuery}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      sessionSockets.set(session.id, ws);

      ws.onopen = () => {
        if (disposed) return;
        reconnectDelay = 1000;
        sendResize();
      };

      ws.onmessage = (event: MessageEvent) => {
        if (disposed) return;
        const data = event.data as string;
        try {
          const parsed = JSON.parse(data) as unknown;
          if (isTitleMessage(parsed)) {
            onTitleRef.current(session.id, parsed.title);
            return;
          }
        } catch {
          // Terminal output is not JSON; pass it through unchanged.
        }
        write(data);
      };

      ws.onclose = () => {
        if (disposed) return;
        if (wsRef.current === ws) {
          wsRef.current = null;
          write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n");
        }
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
      };

      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (sessionSockets.get(session.id) === ws) {
        sessionSockets.delete(session.id);
        if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
      }
      wsRef.current = null;
    };
  }, [core, ready, ref, session.cwd, session.id, session.shell, write]);

  if (!core) {
    return <div className="h-full min-h-0 bg-background" />;
  }

  return (
    <Terminal
      ref={ref}
      core={core}
      autoResize
      theme="monokai"
      style={{
        borderRadius: 0,
        backgroundColor: "var(--background)",
        padding: 8,
        fontFamily: "JetBrains Mono, monospace",
        height: "100%",
        minHeight: 0,
      }}
      cursorBlink
      className="h-full min-h-0 rounded-none p-0"
      onData={(data) => {
        if (isTerminalResponse(data)) return;
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(data);
      }}
      onResize={(cols, rows) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(`\x1b[RESIZE:${cols};${rows}]`);
        }
      }}
      onReady={() => setReady(true)}
      onTitle={(title) => onTitleRef.current(session.id, title)}
    />
  );
}
