import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatusEntry } from "@pierre/trees";
import { apiBase } from "./api-base";
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
      fetch(`${apiBase}/api/files?cwd=${encodeURIComponent(cwd)}`).then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      fetch(`${apiBase}/api/git/status?cwd=${encodeURIComponent(cwd)}`)
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

  return <FilesTreeBody key={cwd} paths={data.paths} gitStatus={data.gitStatus} />;
}

function FilesTreeBody({ paths, gitStatus }: { paths: string[]; gitStatus: GitStatusEntry[] }) {
  const { model } = useFileTree({
    paths,
    gitStatus,
    icons: "complete",
    search: true,
    density: "compact",
    initialExpansion: "closed",
  });

  return (
    <div className="h-full min-h-0 overflow-auto px-1 py-1">
      <FileTree model={model} />
    </div>
  );
}
