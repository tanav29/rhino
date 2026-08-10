import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal, useTerminal, WebSocketTransport } from "@wterm/react";
import { GhosttyCore } from "@wterm/ghostty";
import type { SessionTab } from "./session-tabs";
import { sessionSockets } from "./session-sockets";
import { apiBase } from "./api-base";

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
  const transportRef = useRef<WebSocketTransport | null>(null);
  const pendingSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onTitleRef = useRef(onTitle);

  useEffect(() => {
    let cancelled = false;
    // Keep a useful local history while preserving Ghostty's complete VT support.
    void GhosttyCore.load({ scrollbackLimit: 8 * 1024 * 1024 }).then((loadedCore) => {
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
    function sendResize() {
      const terminal = ref.current?.instance;
      const size =
        pendingSizeRef.current ?? (terminal ? { cols: terminal.cols, rows: terminal.rows } : null);
      if (size) transportRef.current?.send(`\x1b[RESIZE:${size.cols};${size.rows}]`);
    }

    const transport = new WebSocketTransport({
      url: (() => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = apiBase ? "localhost:4242" : window.location.host;
      const shellQuery = session.shell ? `&shell=${encodeURIComponent(session.shell)}` : "";
      const cwdQuery = session.cwd ? `&cwd=${encodeURIComponent(session.cwd)}` : "";
      return `${proto}//${wsHost}/api/terminal?session=${session.id}${shellQuery}${cwdQuery}`;
      })(),
      reconnect: true,
      maxReconnectDelay: 30_000,
      onOpen: () => {
        if (disposed) return;
        sendResize();
      },
      onData: (data) => {
        if (disposed) return;
        if (typeof data !== "string") {
          write(data);
          return;
        }
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
      },
      onClose: () => {
        if (!disposed) {
          write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n");
        }
      },
    });
    transportRef.current = transport;
    sessionSockets.set(session.id, transport);
    transport.connect();

    return () => {
      disposed = true;
      if (sessionSockets.get(session.id) === transport) {
        sessionSockets.delete(session.id);
      }
      transport.close();
      if (transportRef.current === transport) transportRef.current = null;
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
        className="terminal-surface h-full min-h-0 rounded-none p-0"
        style={{
          borderRadius: 0,
          height: "100%",
          minHeight: 0,
        }}
        cursorBlink
        onData={(data) => transportRef.current?.send(data)}
        onResize={(cols, rows) => {
          pendingSizeRef.current = { cols, rows };
          transportRef.current?.send(`\x1b[RESIZE:${cols};${rows}]`);
        }}
        onReady={() => setReady(true)}
        onError={(error) => console.error("Unable to initialize terminal", error)}
        onTitle={(title) => onTitleRef.current(session.id, title)}
    />
  );
}
