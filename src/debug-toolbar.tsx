import { useEffect, useState } from "react";
import { apiFetch } from "./api";

interface ServerSession {
  id: string;
  title: string;
  clients: number;
  createdAt: number;
}

export function DebugToolbar() {
  const [data, setData] = useState<{ count: number; sessions: ServerSession[] }>(
    { count: 0, sessions: [] },
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      void apiFetch("/api/csrf")
        .then((response) => response.json() as Promise<{ token: string }>)
        .then(({ token }) => {
          if (cancelled) return;
          ws = new WebSocket(`${proto}//${window.location.host}/api/debug?csrf=${encodeURIComponent(token)}`);
      ws.onmessage = (event: MessageEvent) => {
        try {
          setData(JSON.parse(event.data as string));
        } catch {
          // ignore malformed messages
        }
      };
          ws.onclose = () => {
            if (!cancelled) retry = setTimeout(connect, 2000);
          };
        });
    };
    connect();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return (
    <div className="fixed bottom-3 right-3 z-[9999] font-mono text-xs">
      <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-2 text-white/80 shadow-lg backdrop-blur">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            data.count > 0 ? "bg-green-400" : "bg-white/30"
          }`}
        />
        <span className="font-semibold">sessions:</span>
        <span className="tabular-nums">{data.count}</span>
        <button
          type="button"
          aria-label="Toggle session details"
          onClick={() => setOpen((o) => !o)}
          className="ml-1 rounded px-1 text-white/40 hover:bg-white/10 hover:text-white"
          title="Toggle details">
          {open ? "▾" : "▸"}
        </button>
      </div>
      {open && data.sessions.length > 0 && (
        <div className="mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-white/15 bg-black/80 p-2 text-white/70 shadow-lg backdrop-blur">
          {data.sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 border-b border-white/5 py-1 last:border-0">
              <span className="truncate text-white/80">{s.title}</span>
              <span className="shrink-0 text-white/40">
                {s.clients} cl
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
