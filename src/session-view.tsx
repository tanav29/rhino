import { useEffect, useLayoutEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import type { SessionTab } from "./session-tabs";
import { sessionSockets } from "./session-sockets";
import { apiBase } from "./api-base";
import "xterm/css/xterm.css";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const visibleRef = useRef(visible);

  const onTitleRef = useRef(onTitle);

  useEffect(() => {
    onTitleRef.current = onTitle;
  }, [onTitle]);

  visibleRef.current = visible;

  useLayoutEffect(() => {
    if (!visible) return;
    try {
      fitAddonRef.current?.fit();
      if (active) termRef.current?.focus();
    } catch {
      // the terminal may not have measurable dimensions yet
    }
  }, [active, visible]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontSize: 14,
      fontFamily: "Cascadia Mono",
    });
    termRef.current = term;
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(container);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // fall back to canvas renderer
    }
    if (visibleRef.current) fitAddon.fit();

    let disposed = false;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    const maxReconnectDelay = 30000;

    function connect() {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = apiBase ? "localhost:4242" : window.location.host;
      const shellQuery = session.shell ? `&shell=${encodeURIComponent(session.shell)}` : "";
      const cwdQuery = session.cwd ? `&cwd=${encodeURIComponent(session.cwd)}` : "";
      const wsUrl = `${proto}//${wsHost}/api/terminal?session=${session.id}${shellQuery}${cwdQuery}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      sessionSockets.set(session.id, ws);

      ws.onopen = () => {
        if (disposed) return;
        reconnectDelay = 1000;
        ws?.send(`\x1b[RESIZE:${term.cols};${term.rows}]`);
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
          // fall through to raw write
        }
        term.write(data);
      };

      ws.onclose = () => {
        if (disposed) return;
        if (wsRef.current === ws) {
          wsRef.current = null;
          term.write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n");
        }
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }
    connect();

    const dataDisposable = term.onData((data) => {
      if (isTerminalResponse(data)) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(`\x1b[RESIZE:${cols};${rows}]`);
      }
    });

    const titleDisposable = term.onTitleChange((title) => {
      onTitleRef.current(session.id, title);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || !visibleRef.current) return;
      try {
        fitAddon.fit();
      } catch {
        // container may be hidden
      }
    });
    resizeObserver.observe(container);

     return () => {
       disposed = true;
       if (reconnectTimer) clearTimeout(reconnectTimer);
       resizeObserver.disconnect();
       dataDisposable.dispose();
       resizeDisposable.dispose();
       titleDisposable.dispose();
       if (sessionSockets.get(session.id) === ws) {
         sessionSockets.delete(session.id);
         if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
       }
       term.dispose();
       if (termRef.current === term) termRef.current = null;
       if (fitAddonRef.current === fitAddon) fitAddonRef.current = null;
     };
  }, [session.id, session.shell, session.cwd]);

  return (
    <div
      ref={containerRef}
      className="term-surface h-full min-h-0 scrollbar-none bg-background"
      style={{
        padding: 0,
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    />
  );
}
