import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import { GhosttyCore } from "@wterm/ghostty";
import type { SessionTab } from "./session-tabs";
import { rpc, subscribePtyExit, subscribePtyOutput, subscribePtyTitle } from "./rpc";

// Sessions whose scrollback replay has already been written in this page
// lifetime. Guards against duplicate attach flows re-writing history.
const replayWritten = new Set<string>();

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

  useLayoutEffect(() => {
    if (!visible || !ready) return;
    const el = ref.current?.instance?.element as HTMLElement | undefined;
    if (!el) return;
    void el.offsetHeight;
  }, [visible, ready, ref]);

  useEffect(() => {
    if (!core || !ready) return;

    let disposed = false;

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
        pendingSizeRef.current = null;
        if (attached.title) onTitleRef.current(session.id, attached.title);
        if (attached.replay && !replayWritten.has(session.id)) {
          replayWritten.add(session.id);
          write(attached.replay);
        }
      } catch {
        if (!disposed) write("\r\n\x1b[91m[failed to attach terminal]\x1b[0m\r\n");
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
      if (!disposed) write("\r\n\x1b[90m[process exited]\x1b[0m\r\n");
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

  if (!core) {
    return (
      <div
        className="h-full min-h-0"
        style={{ background: "oklch(0.105 0 0)", fontSize: `${fontSize}px` } as React.CSSProperties}
      />
    );
  }

  return (
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
      onData={(data) => rpc.send.ptyInput({ sessionId: session.id, data })}
      onResize={(cols, rows) => {
        pendingSizeRef.current = { cols, rows };
        rpc.send.ptyResize({ sessionId: session.id, cols, rows });
      }}
      onReady={() => setReady(true)}
      onError={(error) => console.error("Unable to initialize terminal", error)}
      onTitle={(title) => onTitleRef.current(session.id, title)}
    />
  );
}
