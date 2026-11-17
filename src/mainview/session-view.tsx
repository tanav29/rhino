import { useWorkspaceStore } from "./store";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import type { SessionTab } from "./session-tabs";
import {
  desktopRpc,
  getConnection,
  getBackendClient,
  subscribePtyExit,
  subscribePtyOutput,
  subscribePtyTitle,
  subscribePtyCwd,
} from "./rpc";
import { installTerminalInteractions } from "./terminal-interactions";
import { createTerminalOutputWriter } from "./terminal-output";

export const SessionView = memo(function SessionView({
  session,
  onTitle,
  onCwd,
  active = true,
  visible = true,
  fontSize = 13,
  cursorBlink = false,
}: {
  session: SessionTab;
  onTitle: (id: string, title: string) => void;
  onCwd: (id: string, cwd: string | null) => void;
  active?: boolean;
  visible?: boolean;
  fontSize?: number;
  lineHeight?: number;
  cursorBlink?: boolean;
}) {
  const theme = useWorkspaceStore((s) =>
    s.terminalThemes.find((item) => item.id === s.selectedThemeId),
  );
  const [rpc] = useState(getBackendClient);
  const containerRef = useRef<HTMLDivElement>(null);
  const [runtime, setRuntime] = useState<{
    terminal: Terminal;
    fit: FitAddon;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [linkError, setLinkError] = useState("");
  const replayWritten = useRef(false);
  const pendingSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onTitleRef = useRef(onTitle);
  const onCwdRef = useRef(onCwd);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const ready = runtime !== null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const terminal = new Terminal({
      fontFamily: '"BlexMono Nerd Font", monospace',
      scrollback: 10_000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const observer = new ResizeObserver(() => fitTerminal());
    const fitTerminal = () => {
      if (
        !disposed &&
        visibleRef.current &&
        container.clientWidth > 0 &&
        container.clientHeight > 0
      )
        fit.fit();
    };
    setError(null);
    try {
      terminal.loadAddon(fit);
      terminal.loadAddon(new ImageAddon());
      terminal.onData((data) => rpc.send.ptyInput({ sessionId: session.id, data }));
      terminal.onResize(({ cols, rows }) => {
        pendingSizeRef.current = { cols, rows };
        rpc.send.ptyResize({ sessionId: session.id, cols, rows });
      });
      terminal.onTitleChange((title) => onTitleRef.current(session.id, title));
      terminal.open(container);
      fitTerminal();
      observer.observe(container);
      void document.fonts.ready.then(fitTerminal);
      setRuntime({ terminal, fit });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to initialize terminal");
    }
    return () => {
      disposed = true;
      observer.disconnect();
      terminal.dispose();
      setRuntime(null);
      pendingSizeRef.current = null;
      replayWritten.current = false;
    };
  }, [attempt, rpc, session.id]);

  useEffect(() => {
    onTitleRef.current = onTitle;
    onCwdRef.current = onCwd;
  }, [onTitle, onCwd]);

  useLayoutEffect(() => {
    if (!ready || !visible || !active) return;
    runtime?.terminal.focus();
  }, [active, runtime, ready, visible]);

  useLayoutEffect(() => {
    if (!visible || !ready) return;
    runtime?.fit.fit();
    runtime?.terminal.refresh(0, runtime.terminal.rows - 1);
  }, [visible, ready, runtime]);

  useEffect(() => {
    const terminal = runtime?.terminal;
    if (!ready || !terminal) return;
    return installTerminalInteractions(terminal, (target) => {
      setLinkError("");
      if (desktopRpc && (/^(https?|mailto):/i.test(target) || !getConnection().url)) {
        void desktopRpc.request
          .openTerminalLink({ sessionId: session.id, target })
          .catch((cause) =>
            setLinkError(cause instanceof Error ? cause.message : "Unable to open link"),
          );
      } else if (/^https?:\/\//i.test(target)) {
        window.open(target, "_blank", "noopener,noreferrer");
      } else {
        setLinkError("File links require a local desktop session");
      }
    });
  }, [ready, runtime, session.id]);

  useEffect(() => {
    if (!runtime) return;
    const { terminal } = runtime;

    let disposed = false;
    let receivedCwd = false;
    let receivedTitle = false;
    const output = createTerminalOutputWriter((data) => terminal.write(data));
    setExited(false);
    setError(null);

    // Subscribe before sending the request; replay may overlap buffered live output.
    const unsubOutput = subscribePtyOutput(session.id, (chunk) => {
      if (!disposed) output.output(chunk);
    });
    const unsubTitle = subscribePtyTitle(session.id, (title) => {
      if (disposed) return;
      receivedTitle = true;
      onTitleRef.current(session.id, title);
    });
    const unsubCwd = subscribePtyCwd(session.id, (cwd) => {
      if (disposed) return;
      receivedCwd = true;
      onCwdRef.current(session.id, cwd);
    });
    const unsubExit = subscribePtyExit(session.id, () => {
      if (!disposed) setExited(true);
    });

    void (async () => {
      try {
        const size = pendingSizeRef.current ?? { cols: terminal.cols, rows: terminal.rows };
        const attached = await rpc.request.attachSession({
          sessionId: session.id,
          shell: session.shell || undefined,
          cwd: session.cwd || "~",
          sourceSessionId: session.sourceSessionId,
          cols: size.cols,
          rows: size.rows,
        });
        if (disposed) return;
        if (!receivedCwd) onCwdRef.current(session.id, attached.cwd);
        if (!receivedTitle && attached.title) onTitleRef.current(session.id, attached.title);
        output.attach(replayWritten.current ? "" : attached.replay, attached.outputOffset);
        replayWritten.current = true;
        const latestSize = pendingSizeRef.current;
        if (latestSize) rpc.send.ptyResize({ sessionId: session.id, ...latestSize });
        pendingSizeRef.current = null;
      } catch (cause) {
        if (!disposed) {
          output.attach("");
          setError(cause instanceof Error ? cause.message : "Unable to start shell");
        }
      }
    })();

    return () => {
      disposed = true;
      unsubOutput();
      unsubTitle();
      unsubCwd();
      unsubExit();
    };
  }, [runtime, rpc, session.cwd, session.id, session.shell]);

  const ansiNames = [
    "Black",
    "Red",
    "Green",
    "Yellow",
    "Blue",
    "Magenta",
    "Cyan",
    "White",
    "BrightBlack",
    "BrightRed",
    "BrightGreen",
    "BrightYellow",
    "BrightBlue",
    "BrightMagenta",
    "BrightCyan",
    "BrightWhite",
  ] as const;
  const themeStyle: Record<string, string> = {};
  if (theme) {
    for (const [key, variable] of [
      ["terminal.background", "--term-bg"],
      ["terminal.foreground", "--term-fg"],
      ["terminalCursor.foreground", "--term-cursor"],
      ["terminal.selectionBackground", "--term-selection-bg"],
      ...ansiNames.map((name, index) => [`terminal.ansi${name}`, `--term-color-${index}`]),
    ]) {
      const color = theme.colors[key];
      if (typeof color === "string" && /^#[\da-f]{6}([\da-f]{2})?$/i.test(color))
        themeStyle[variable] = color;
    }
  }
  useLayoutEffect(() => {
    const terminal = runtime?.terminal;
    const element = containerRef.current;
    if (!ready || !terminal || !element) return;
    const css = getComputedStyle(element);
    const color = (variable: string) => {
      const probe = document.createElement("span");
      probe.style.color = css.getPropertyValue(variable).trim();
      element.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const colors: ITheme = {
      foreground: color("--term-fg"),
      background: color("--term-bg"),
      cursor: color("--term-cursor"),
      selectionBackground: color("--term-selection-bg"),
      selectionInactiveBackground: color("--term-selection-bg"),
    };
    ansiNames.forEach((name, index) => {
      const key = (name[0].toLowerCase() + name.slice(1)) as Uncapitalize<
        (typeof ansiNames)[number]
      >;
      colors[key] = color(`--term-color-${index}`);
    });
    terminal.options.theme = colors;
  }, [theme, ready, runtime]);

  useLayoutEffect(() => {
    if (!runtime) return;
    runtime.terminal.options.fontSize = fontSize;
    runtime.terminal.options.lineHeight = 1.0;
    runtime.terminal.options.cursorBlink = cursorBlink;
    if (visible) runtime.fit.fit();
  }, [fontSize, cursorBlink, runtime, visible]);

  return (
    <div
      className="relative box-border h-full min-h-0 bg-(--term-bg) [--term-bg:var(--background)]"
      style={{ "--term-bg": themeStyle["--term-bg"] ?? "var(--background)" } as React.CSSProperties}
    >
      {!ready && !error && (
        <div role="status" className="p-4 font-mono text-xs text-muted-foreground">
          Starting terminal…
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full min-h-0 isolate [color-scheme:dark] [--term-fg:#abb2bf] [--term-cursor:var(--primary)] [--term-selection-bg:var(--selection)] [--term-color-0:#282c34] [--term-color-1:#e06c75] [--term-color-2:#98c379] [--term-color-3:#e5c07b] [--term-color-4:#61afef] [--term-color-5:#c678dd] [--term-color-6:#56b6c2] [--term-color-7:#abb2bf] [--term-color-8:#636d83] [--term-color-9:#ea858b] [--term-color-10:#aad581] [--term-color-11:#ffd885] [--term-color-12:#85c1ff] [--term-color-13:#d398eb] [--term-color-14:#6ed5de] [--term-color-15:#fafafa] [&>.xterm]:h-full [&>.xterm]:p-2 [&_.xterm-viewport]:bg-(--term-bg)"
        style={themeStyle as React.CSSProperties}
      />
      {linkError && (
        <div
          role="alert"
          className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded border border-border bg-popover px-3 py-2 text-xs text-foreground"
        >
          <span>{linkError}</span>
          <button
            type="button"
            aria-label="Dismiss link error"
            onClick={() => setLinkError("")}
            className="shrink-0 px-2 py-1 hover:bg-accent"
          >
            Dismiss
          </button>
        </div>
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
});
