import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import { parseGitStatus, type GitChangedFile } from "./git-status";
import { rpc } from "./rpc";
import type { GitDiffResult } from "../shared/rpc-schema";

export function GitPanel({ cwd }: { cwd?: string }) {
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);
    setSelected(null);
    rpc.request
      .readGitStatus({ cwd: cwd ?? "." })
      .then((text) => {
        if (!cancelled) setFiles(parseGitStatus(text));
      })
      .catch(() => {
        if (!cancelled) setError("Git unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  if (selected) {
    return <DiffViewer cwd={cwd} path={selected} onClose={() => setSelected(null)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      {error ? (
        <p className="p-3 text-xs text-muted-foreground">{error}</p>
      ) : files === null ? (
        <div role="status" className="p-3 text-xs text-muted-foreground">
          Loading…
        </div>
      ) : files.length === 0 ? (
        <div className="p-3">
          <p className="text-xs text-muted-foreground">Working tree clean</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto py-1">
          <div className="flex h-7 shrink-0 items-center justify-between px-3">
            <span className="text-xs font-medium text-muted-foreground">Changed files</span>
            <span className="text-xs tabular-nums text-muted-foreground">{files.length}</span>
          </div>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              title={f.path}
              onClick={() => setSelected(f.path)}
              className="flex h-7 shrink-0 items-center gap-2 px-3 text-left hover:bg-accent"
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${f.status === "deleted" ? "bg-destructive" : f.status === "added" || f.status === "untracked" ? "bg-success" : "bg-warning"}`}
              />
              <span className="min-w-0 flex-1 truncate text-xs tracking-tight text-foreground">
                {f.path}
              </span>
              <span className="rounded bg-accent px-1 py-0.5 font-mono text-[10px] font-medium leading-none text-muted-foreground">
                {f.code}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function createAddedPatch(path: string, contents: string) {
  const lines = contents.endsWith("\n") ? contents.slice(0, -1).split("\n") : contents.split("\n");
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${path}`,
    ...(lines.length > 0 && lines[0] !== ""
      ? [`@@ -0,0 +${lines.length} @@`, ...lines.map((line) => `+${line}`)]
      : []),
    "",
  ].join("\n");
}

function DiffViewer({ cwd, path, onClose }: { cwd?: string; path: string; onClose?: () => void }) {
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  // A selected file should show its patch immediately; collapsing remains
  // available for large diffs without making the panel look empty.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    rpc.request
      .readGitDiff({ cwd: cwd ?? ".", path })
      .then((data) => {
        if (!cancelled) setDiff(data);
      })
      .catch(() => {
        if (!cancelled) setDiff({ error: "Unable to load diff" });
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path]);

  const renderHeader = (additions = 0, deletions = 0) => (
    <div className="flex h-8 shrink-0 items-center border-b border-border bg-sidebar px-2 gap-1.5 text-xs text-foreground">
      {onClose && (
        <button
          type="button"
          aria-label="Back to changed files"
          onClick={onClose}
          title="Back to changed files"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-accent aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <ArrowLeft size={14} />
        </button>
      )}
      <button
        type="button"
        aria-label={`${collapsed ? "Expand" : "Collapse"} diff for ${path}`}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-accent aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <ChevronDown className={`h-4 w-4 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
      </button>
      <span className="truncate font-[500] tracking-tight">{path}</span>
      <span className="ml-auto flex shrink-0 gap-1.5">
        {additions > 0 && (
          <span className="rounded bg-success/15 px-1 py-0.5 text-success">+{additions}</span>
        )}
        {deletions > 0 && (
          <span className="rounded bg-destructive/15 px-1 py-0.5 text-destructive">
            −{deletions}
          </span>
        )}
      </span>
    </div>
  );

  const renderPatchHeader = (fileDiff: {
    hunks: { additionLines: number; deletionLines: number }[];
  }) =>
    renderHeader(
      fileDiff.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
      fileDiff.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0),
    );

  return (
    <div className="h-full overflow-auto bg-sidebar">
      {!diff ? (
        <div role="status" className="p-3 text-xs text-muted-foreground">
          Loading diff…
        </div>
      ) : "error" in diff ? (
        <>
          {renderHeader()}
          <p className="p-3 text-xs text-muted-foreground">{diff.error}</p>
        </>
      ) : diff.kind === "added" || diff.kind === "diff" ? (
        <PatchDiff
          patch={diff.kind === "added" ? createAddedPatch(path, diff.contents) : diff.patch}
          renderCustomHeader={renderPatchHeader}
          options={{
            themeType: "dark",
            diffStyle: "unified",
            theme: "github-dark-default",
            collapsed,
            unsafeCSS: `
              :host { --diffs-font-size: 12px; --diffs-line-height: 18px; --diffs-font-family: var(--font-mono); --diffs-header-font-family: var(--font-sans); }
              :host, pre { --diffs-bg: var(--background); --diffs-fg: var(--foreground); }
              :host { background-color: var(--background) !important; }
              [data-separator] { border-radius: 2px; }
              *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
            `,
          }}
          className="h-full w-full font-mono"
        />
      ) : (
        <>
          {renderHeader()}
          <p className="p-3 font-mono text-xs text-muted-foreground">No changes to display.</p>
        </>
      )}
    </div>
  );
}
