import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { themeToTreeStyles, type GitStatusEntry } from "@pierre/trees";
import { rpc } from "./rpc";
import { parseGitStatus, toGitStatusEntries } from "./git-status";

interface FilesData {
  paths: string[];
  gitStatus: GitStatusEntry[];
}

const treeStyle = themeToTreeStyles({
  type: "dark",
  colors: {
    "sideBar.background": "#010409",
    "sideBar.foreground": "#f0f6fc",
    "sideBar.border": "#3d444d",
    "list.hoverBackground": "#212830",
    "list.activeSelectionBackground": "#388bfd26",
    "list.activeSelectionForeground": "#f0f6fc",
    "list.focusOutline": "#58a6ff",
    "input.background": "#0d1117",
    "input.border": "#3d444d",
    "gitDecoration.addedResourceForeground": "#3fb950",
    "gitDecoration.modifiedResourceForeground": "#d29922",
    "gitDecoration.deletedResourceForeground": "#f85149",
  },
});

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

  if (error) return <p className="p-3 font-mono text-xs text-muted-foreground">{error}</p>;
  if (!data)
    return (
      <div className="flex items-center gap-2 p-3 font-mono text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        Loading files…
      </div>
    );
  if (data.paths.length === 0)
    return <p className="p-3 font-mono text-xs text-muted-foreground">No files found in {cwd}.</p>;

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
    <div className="h-full min-h-0 overflow-auto bg-sidebar p-2">
      <FileTree model={model} style={treeStyle} />
    </div>
  );
}
