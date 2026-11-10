import { useEffect, useState, type CSSProperties } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatusEntry } from "@pierre/trees";
import { rpc } from "./rpc";
import { parseGitStatus, toGitStatusEntries } from "./git-status";

interface FilesData {
  paths: string[];
  gitStatus: GitStatusEntry[];
}

// Pass shared tokens into the tree's shadow root instead of maintaining a second theme.
const treeStyle = {
  colorScheme: "dark",
  "--trees-bg-override": "var(--sidebar)",
  "--trees-bg-muted-override": "var(--accent)",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-border-color-override": "var(--border)",
  "--trees-selected-bg-override": "var(--selection)",
  "--trees-selected-fg-override": "var(--foreground)",
  "--trees-focus-ring-color-override": "var(--ring)",
  "--trees-selected-focused-border-color-override": "var(--ring)",
  "--trees-search-bg-override": "var(--background)",
  "--trees-input-bg-override": "var(--background)",
  "--trees-font-family-override": "var(--font-sans)",
  "--trees-font-size-override": "12px",
  "--trees-border-radius-override": "2px",
  "--trees-scrollbar-thumb-override": "var(--input)",
  "--trees-status-added-override": "var(--success)",
  "--trees-status-untracked-override": "var(--success)",
  "--trees-status-modified-override": "var(--warning)",
  "--trees-status-deleted-override": "var(--destructive)",
  "--trees-status-renamed-override": "var(--primary)",
  "--trees-status-ignored-override": "var(--muted-foreground)",
  "--truncate-fade-in-duration": "0s",
} as CSSProperties;

export function FilesPanel({ cwd }: { cwd: string }) {
  const [data, setData] = useState<FilesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    Promise.all([
      rpc.request.listProjectFiles({ cwd }),
      rpc.request.readGitStatus({ cwd }).catch(() => ""),
    ])
      .then(([filesRes, statusText]) => {
        if (cancelled) return;
        if (filesRes.error && filesRes.paths.length === 0) {
          setError(filesRes.error);
          return;
        }
        setData({
          paths: filesRes.paths,
          gitStatus: toGitStatusEntries(parseGitStatus(statusText)),
        });
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load files");
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  if (error) return <p className="p-3 text-xs text-muted-foreground">{error}</p>;
  if (!data)
    return (
      <div role="status" className="p-3 text-xs text-muted-foreground">
        Loading files…
      </div>
    );
  if (data.paths.length === 0)
    return <p className="p-3 text-xs text-muted-foreground">No files found in {cwd}.</p>;

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
    unsafeCSS:
      "*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }",
  });

  return (
    <div className="h-full min-h-0 overflow-auto bg-sidebar p-1">
      <FileTree model={model} style={treeStyle} />
    </div>
  );
}
