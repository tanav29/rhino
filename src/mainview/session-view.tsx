import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import { GhosttyCore } from "@wterm/ghostty";
import type { SessionTab } from "./session-tabs";
import { rpc, subscribePtyExit, subscribePtyOutput, subscribePtyTitle } from "./rpc";

export function SessionView({
  session,
  onTitle,
  active = true,
  visible = true,
  fontSize = 13,
  lineHeight = 1.38,
  cursorBlink = true,
}: {
  session: SessionTab;
  onTitle: (id: string, title: string) => void;
  active?: boolean;
  visible?: boolean;
  fontSize?: number;
  lineHeight?: number;
  cursorBlink?: boolean;
}) {
  const { ref, write, focus } = useTerminal();
  const [core, setCore] = useState<GhosttyCore | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const replayWritten = useRef(false);
  const pendingSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onTitleRef = useRef(onTitle);

  useEffect(() => {
    let cancelled = false;
    // Keep a useful local history while preserving Ghostty's complete VT support.
    setError(null);
    void GhosttyCore.load({ scrollbackLimit: 8 * 1024 * 1024 })
      .then((loadedCore) => {
        if (!cancelled) setCore(loadedCore);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Unable to load terminal");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    onTitleRef.current = onTitle;
  }, [onTitle]);

  useLayoutEffect(() => {
    if (ready && visible && active) focus();
  }, [active, focus, ready, visible]);

  useLayoutEffect(() => {
    if (!visible || !ready) return;
    const el = ref.current?.instance?.element as HTMLElement | undefined;
    if (!el) return;
    void el.offsetHeight;
  }, [visible, ready, ref]);

  useEffect(() => {
    if (!core || !ready) return;

    let disposed = false;
    setExited(false);
    setError(null);

    void (async () => {
      try {
        const instance = ref.current?.instance;
        const size =
          pendingSizeRef.current ??
          (instance ? { cols: instance.cols, rows: instance.rows } : { cols: 80, rows: 24 });
        const attached = await rpc.request.attachSession({
          sessionId: session.id,
          shell: session.shell || undefined,
          cwd: session.cwd || undefined,
          cols: size.cols,
          rows: size.rows,
        });
        if (disposed) return;
        if (attached.title) onTitleRef.current(session.id, attached.title);
        if (attached.replay && !replayWritten.current) {
          replayWritten.current = true;
          write(attached.replay);
        }
        const latestSize = pendingSizeRef.current;
        if (latestSize) rpc.send.ptyResize({ sessionId: session.id, ...latestSize });
        pendingSizeRef.current = null;
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Unable to start shell");
      }
    })();

    // Subscriptions are registered synchronously so no output is missed
    // while the attach request is in flight.
    const unsubOutput = subscribePtyOutput(session.id, (data) => {
      if (!disposed) write(data);
    });
    const unsubTitle = subscribePtyTitle(session.id, (title) =>
      onTitleRef.current(session.id, title),
    );
    const unsubExit = subscribePtyExit(session.id, () => {
      if (!disposed) setExited(true);
    });

    return () => {
      disposed = true;
      unsubOutput();
      unsubTitle();
      unsubExit();
    };
  }, [core, ready, ref, session.cwd, session.id, session.shell, write]);

  const rowHeight = Math.round(fontSize * lineHeight);

  // wterm's ResizeObserver only recomputes the grid when the container's box
  // changes size. A font-size / line-height change keeps the box identical, so
  // the cell metrics (and thus cols/rows and the PTY geometry) go stale. Re-fit
  // manually: measure a probe cell, derive cols/rows, and resize — resize()
  // fires onResize below, which propagates the new size to the PTY.
  useLayoutEffect(() => {
    if (!ready) return;
    const wt = ref.current?.instance;
    const el = wt?.element as HTMLElement | undefined;
    if (!wt || !el) return;
    const grid = (el.querySelector(".term-grid") as HTMLElement | null) ?? el;
    const probe = document.createElement("div");
    probe.className = "term-row";
    probe.style.cssText = "visibility:hidden;position:absolute;";
    const span = document.createElement("span");
    span.textContent = "W";
    probe.appendChild(span);
    grid.appendChild(probe);
    const charWidth = span.getBoundingClientRect().width;
    probe.remove();
    if (charWidth <= 0) return;
    const cs = getComputedStyle(el);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const cols = Math.max(1, Math.floor((el.clientWidth - padX) / charWidth));
    const rows = Math.max(1, Math.floor((el.clientHeight - padY) / rowHeight));
    if (cols !== wt.cols || rows !== wt.rows) wt.resize(cols, rows);
  }, [fontSize, rowHeight, ready, ref]);

  return (
    <div className="relative h-full min-h-0 bg-background">
      {!core && !error && (
        <div role="status" className="p-4 font-mono text-xs text-muted-foreground">
          Starting terminal…
        </div>
      )}
      {core && (
        <Terminal
          ref={ref}
          core={core}
          autoResize
          className="terminal-surface h-full min-h-0"
          style={
            {
              borderRadius: 0,
              height: "100%",
              minHeight: 0,
              "--term-font-size": `${fontSize}px`,
              "--term-line-height": `${lineHeight}`,
              "--term-row-height": `${rowHeight}px`,
            } as React.CSSProperties
          }
          cursorBlink={cursorBlink}
          renderingPaused={!visible}
          onData={(data) => rpc.send.ptyInput({ sessionId: session.id, data })}
          onResize={(cols, rows) => {
            pendingSizeRef.current = { cols, rows };
            rpc.send.ptyResize({ sessionId: session.id, cols, rows });
          }}
          onReady={() => setReady(true)}
          onError={(cause) =>
            setError(cause instanceof Error ? cause.message : "Unable to initialize terminal")
          }
          onTitle={(title) => onTitleRef.current(session.id, title)}
        />
      )}
      {(error || exited) && (
        <div
          role="status"
          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border bg-popover px-4 py-3 text-xs text-muted-foreground"
        >
          <span className="min-w-0 truncate" title={error ?? undefined}>
            {error ?? "Shell exited"}
          </span>
          <button
            type="button"
            className="shrink-0 rounded border border-border px-3 py-1.5 text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              replayWritten.current = false;
              setCore(null);
              setReady(false);
              setExited(false);
              rpc.send.killSession({ sessionId: session.id });
              setAttempt((value) => value + 1);
            }}
          >
            Restart terminal
          </button>
        </div>
      )}
    </div>
  );
}
