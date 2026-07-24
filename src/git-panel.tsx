import { useEffect, useState } from "react";
import { GitCommit, Loader2 } from "lucide-react";
import { File as CodeFile, PatchDiff } from "@pierre/diffs/react";
import { parseGitStatus, type GitChangedFile } from "./git-status";

type DiffResponse =
  | { kind: "added"; contents: string }
  | { kind: "diff"; patch: string }
  | { kind: "empty" }
  | { error: string };

const STATUS_LABEL: Record<GitChangedFile["status"], string> = {
  added: "A", deleted: "D", modified: "M", renamed: "R", untracked: "U", ignored: "I",
};

export function GitPanel({ cwd }: { cwd?: string }) {
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);
    setSelected(null);
    fetch(`/api/git/status?cwd=${encodeURIComponent(cwd ?? ".")}`)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        const branchLine = text.split("\n").find((l) => l.startsWith("##"));
        setBranch(branchLine ? branchLine.slice(3).trim() : null);
        setFiles(parseGitStatus(text));
      })
      .catch(() => { if (!cancelled) setError("Git unavailable"); });
    return () => { cancelled = true; };
  }, [cwd]);

  if (selected) {
    return <DiffViewer cwd={cwd} path={selected} onClose={() => setSelected(null)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground"><GitCommit size={14} />{branch ?? "Changes"}</div>
      {error ? (
        <p className="text-xs text-sidebar-foreground/60">{error}</p>
      ) : files === null ? (
        <div className="flex items-center gap-2 text-xs text-sidebar-foreground/50"><Loader2 size={12} className="animate-spin" />Loading…</div>
      ) : files.length === 0 ? (
        <p className="text-xs text-sidebar-foreground/60">Working tree clean</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelected(f.path)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              <span className="w-4 shrink-0 text-center font-mono text-[10px] text-muted-foreground">{STATUS_LABEL[f.status]}</span>
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffViewer({ cwd, path, onClose }: { cwd?: string; path: string; onClose: () => void }) {
  const [diff, setDiff] = useState<DiffResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    fetch(`/api/git/diff?cwd=${encodeURIComponent(cwd ?? ".")}&path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setDiff(data); })
      .catch(() => { if (!cancelled) setDiff({ error: "Unable to load diff" }); });
    return () => { cancelled = true; };
  }, [cwd, path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={onClose} className="shrink-0 text-xs text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground">← Changes</button>
        <span className="truncate text-xs text-sidebar-foreground/70">{path}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!diff ? (
          <div className="flex items-center gap-2 p-3 text-xs text-sidebar-foreground/50"><Loader2 size={12} className="animate-spin" />Loading diff…</div>
        ) : "error" in diff ? (
          <p className="p-3 text-xs text-sidebar-foreground/60">{diff.error}</p>
        ) : diff.kind === "added" ? (
          <CodeFile file={{ name: path, contents: diff.contents }} options={{ themeType: "dark" }} className="h-full w-full" />
        ) : diff.kind === "diff" ? (
          <PatchDiff patch={diff.patch} options={{ themeType: "dark" }} className="h-full w-full" />
        ) : (
          <p className="p-3 text-xs text-sidebar-foreground/60">No changes to display.</p>
        )}
      </div>
    </div>
  );
}
