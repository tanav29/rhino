import { useEffect, useLayoutEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { SessionTab } from "./session-tabs";
import { sessionSockets } from "./session-sockets";
import "@xterm/xterm/css/xterm.css";

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

export function SessionView({
  session,
  onTitle,
}: {
  session: SessionTab;
  onTitle: (id: string, title: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const onTitleRef = useRef(onTitle);

  useEffect(() => {
    onTitleRef.current = onTitle;
  }, [onTitle]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      // cols: 80,
      // rows: 24,
      fontSize: 14,
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
      },
      fontFamily: "Cascadia Mono",
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);

    fitAddon.fit();

    // Prefer the GPU renderer for crisp glyphs; load it dynamically so its
    // browser-only module never runs during SSR. Falls back to the DOM
    // renderer automatically if WebGL is unavailable or its context is lost.
    let disposed = false;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const shellQuery = session.shell
      ? `&shell=${encodeURIComponent(session.shell)}`
      : "";
    const wsUrl = `${proto}//${window.location.host}/api/terminal?session=${session.id}${shellQuery}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    sessionSockets.set(session.id, ws);

    ws.onopen = () => {
      if (disposed) return;
      ws.send(`\x1b[RESIZE:${term.cols};${term.rows}]`);
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
      if (!disposed && wsRef.current === ws) {
        wsRef.current = null;
        term.write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
      }
    };

    const dataDisposable = term.onData((data) => {
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
      if (disposed) return;
      try {
        fitAddon.fit();
      } catch {
        // container may be hidden
      }
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      titleDisposable.dispose();
      sessionSockets.delete(session.id);
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
      term.dispose();
    };
  }, [session.id, session.shell]);

  return (
    <div
      ref={containerRef}
      className="term-surface h-full min-h-0 scrollbar-none"
      style={{
        height: "100%",
        padding: 0,
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    />
  );
}
