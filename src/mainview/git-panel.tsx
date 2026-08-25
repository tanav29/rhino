import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import { parseGitStatus, type GitChangedFile } from "./git-status";
import { rpc } from "./rpc";

type DiffResponse =
  | { kind: "added"; contents: string }
  | { kind: "diff"; patch: string }
  | { kind: "empty" }
  | { error: string };

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
    <div className="flex h-full min-h-0 flex-col ">
      {error ? (
        <p className="p-4 text-xs text-sidebar-foreground/60">{error}</p>
      ) : files === null ? (
        <div className="flex items-center gap-2 p-4 text-xs text-sidebar-foreground/50">
          <Loader2 size={12} className="animate-spin" />
          Loading…
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col gap-1 p-4">
          <p className="text-xs font-medium text-sidebar-foreground/80">Working tree clean</p>
          <p className="text-[11px] text-sidebar-foreground/50">
            No changed files in this workspace.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto p-2">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
            Changed files · {files.length}
          </div>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelected(f.path)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-sidebar-accent"
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${f.status === "deleted" ? "bg-red-400" : f.status === "added" || f.status === "untracked" ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              <span className="min-w-0 flex-1 truncate text-sidebar-foreground/80">{f.path}</span>
              <span className="font-mono text-[10px] text-sidebar-foreground/45">{f.code}</span>
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
  const [diff, setDiff] = useState<DiffResponse | null>(null);
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
    <div className="flex items-center gap-1 border-b border-sidebar-border px-2 py-1 font-mono text-xs">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          ←
        </button>
      )}
      <button
        type="button"
        aria-label={`${collapsed ? "Expand" : "Collapse"} diff for ${path}`}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
        className="rounded p-0.5 hover:bg-sidebar-accent"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
        />
      </button>
      <span className="truncate">{path}</span>
      <span className="ml-auto flex shrink-0 gap-2">
        {additions > 0 && <span className="text-green-500">+{additions}</span>}
        {deletions > 0 && <span className="text-red-500">−{deletions}</span>}
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
    <div className="h-full overflow-auto">
      {!diff ? (
        <div className="flex items-center gap-2 p-3 text-xs text-sidebar-foreground/50">
          <Loader2 size={12} className="animate-spin" />
          Loading diff…
        </div>
      ) : "error" in diff ? (
        <p className="p-3 text-xs text-sidebar-foreground/60">{diff.error}</p>
      ) : diff.kind === "added" ? (
        <PatchDiff
          patch={createAddedPatch(path, diff.contents)}
          renderCustomHeader={renderPatchHeader}
          options={{
            themeType: "dark",
            diffStyle: "unified",
            theme: "aurora-x",
            disableFileHeader: true,
            collapsed,
          }}
          className="h-full w-full font-mono"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        />
      ) : diff.kind === "diff" ? (
        <PatchDiff
          patch={diff.patch}
          renderCustomHeader={renderPatchHeader}
          options={{
            themeType: "dark",
            diffStyle: "unified",
            theme: "aurora-x",
            disableFileHeader: true,
            collapsed,
          }}
          className="h-full w-full font-mono"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        />
      ) : (
        <>
          {renderHeader()}
          <p className="p-3 text-xs text-sidebar-foreground/60">No changes to display.</p>
        </>
      )}
    </div>
  );
}
