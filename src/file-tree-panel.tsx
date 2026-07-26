import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatusEntry } from "@pierre/trees";
import { File as CodeFile } from "@pierre/diffs/react";
import { parseGitStatus, toGitStatusEntries } from "./git-status";

interface FilesData {
  paths: string[];
  gitStatus: GitStatusEntry[];
}

export function FilesPanel({ cwd }: { cwd: string }) {
  const [data, setData] = useState<FilesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    Promise.all([
      fetch(`/api/files?cwd=${encodeURIComponent(cwd)}`).then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      fetch(`/api/git/status?cwd=${encodeURIComponent(cwd)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error();
          return r.text();
        })
        .catch(() => ""),
    ])
      .then(([filesRes, statusText]) => {
        if (cancelled) return;
        const paths: string[] = filesRes?.paths ?? [];
        if (filesRes?.error && paths.length === 0) {
          setError(filesRes.error);
          return;
        }
        setData({ paths, gitStatus: toGitStatusEntries(parseGitStatus(statusText)) });
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load files");
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  if (error) return <p className="p-3 text-xs text-sidebar-foreground/60">{error}</p>;
  if (!data)
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-sidebar-foreground/50">
        <Loader2 size={12} className="animate-spin" />
        Loading files…
      </div>
    );
  if (data.paths.length === 0)
    return <p className="p-3 text-xs text-sidebar-foreground/60">No files found in {cwd}.</p>;

  return <FilesTreeBody key={cwd} cwd={cwd} paths={data.paths} gitStatus={data.gitStatus} />;
}

function FilesTreeBody({
  cwd,
  paths,
  gitStatus,
}: {
  cwd: string;
  paths: string[];
  gitStatus: GitStatusEntry[];
}) {
  const fileSet = useMemo(() => new Set(paths), [paths]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { model } = useFileTree({
    paths,
    gitStatus,
    icons: "complete",
    search: true,
    density: "compact",
    initialExpansion: "closed",
    onSelectionChange: (selected) => setSelectedFile(selected.find((p) => fileSet.has(p)) ?? null),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={
          selectedFile
            ? "min-h-0 overflow-hidden border-b border-border"
            : "min-h-0 flex-1 overflow-hidden"
        }
      >
        <FileTree model={model} />
      </div>
      {selectedFile && (
        <FileViewer
          key={selectedFile}
          cwd={cwd}
          path={selectedFile}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
}

function FileViewer({ cwd, path, onClose }: { cwd: string; path: string; onClose: () => void }) {
  const [state, setState] = useState<{ contents?: string; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    fetch(`/api/file?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState({ error: "Unable to read file" });
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-xs text-sidebar-foreground/70">{path}</span>
        <button
          type="button"
          aria-label="Close file preview"
          onClick={onClose}
          className="shrink-0 text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground"
        >
          <X size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!state ? (
          <div className="flex items-center gap-2 p-3 text-xs text-sidebar-foreground/50">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        ) : state.error ? (
          <p className="p-3 text-xs text-sidebar-foreground/60">{state.error}</p>
        ) : (
          <CodeFile
            file={{ name: path, contents: state.contents ?? "" }}
            options={{ themeType: "dark" }}
            className="h-full w-full"
          />
        )}
      </div>
    </div>
  );
}
