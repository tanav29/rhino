import { useEffect, useState } from "react";
import { ChevronUp, Folder, TerminalSquare } from "lucide-react";
import { rpc } from "./rpc";
import type { DirectoryListing, ShellOption } from "../shared/rpc-schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function NewSessionDialog({
  open,
  onOpenChange,
  shells,
  initialPath,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shells: ShellOption[];
  initialPath: string;
  onCreate: (shell: string | undefined, cwd: string) => void;
}) {
  const [shell, setShell] = useState("");
  const [browse, setBrowse] = useState<DirectoryListing | null>(null);
  const [pathInput, setPathInput] = useState(initialPath);
  const [loading, setLoading] = useState(false);

  const loadPath = async (path: string) => {
    setLoading(true);
    try {
      const data = await rpc.request.browseDirectory({ path });
      setBrowse(data);
      setPathInput(data.path);
    } catch {
      setBrowse({ path, parent: null, entries: [], error: "Unable to browse" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setShell("");
      setPathInput(initialPath);
      loadPath(initialPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>Choose a shell and starting directory.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Shell</span>
            <select
              value={shell}
              onChange={(event) => setShell(event.target.value)}
              className="h-8 min-w-0 rounded-md border border-input/60 bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 disabled:opacity-50 w-full"
            >
              <option value="" className="bg-popover">
                Default shell
              </option>
              {shells.map((option) => (
                <option key={option.value} value={option.value} className="bg-popover">
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="workspace-directory"
              className="text-xs font-medium text-muted-foreground"
            >
              Directory
            </label>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadPath(pathInput);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                id="workspace-directory"
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
                spellCheck={false}
                className="h-8 min-w-0 rounded-md border border-input/60 bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 disabled:opacity-50 flex-1 font-mono"
                placeholder="/path/to/project"
              />
              <Button type="submit" variant="outline" size="sm">
                Go
              </Button>
            </form>
            <div className="h-52 overflow-y-auto rounded-sm border border-border bg-sidebar">
              {loading ? (
                <div role="status" className="p-3 text-xs text-muted-foreground">
                  Loading directories…
                </div>
              ) : browse?.error ? (
                <p className="p-3 font-mono text-xs text-destructive">{browse.error}</p>
              ) : (
                <>
                  {browse?.parent && (
                    <button
                      type="button"
                      aria-label="Go to parent directory"
                      onClick={() => loadPath(browse.parent!)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <ChevronUp size={13} />
                      Up a level
                    </button>
                  )}
                  {browse?.entries.length === 0 && (
                    <p className="p-3 font-mono text-xs text-muted-foreground">No subfolders</p>
                  )}
                  {browse?.entries.map((entry) => (
                    <button
                      type="button"
                      aria-label={`Open ${entry.name}`}
                      key={entry.path}
                      onClick={() => loadPath(entry.path)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent hover:text-foreground"
                    >
                      <Folder size={13} className="shrink-0 text-muted-foreground" />
                      <span className="truncate tracking-tight">{entry.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading || !!browse?.error || !browse?.path}
            onClick={() => {
              onCreate(shell || undefined, browse?.path ?? pathInput);
              onOpenChange(false);
            }}
          >
            <TerminalSquare size={14} />
            Create terminal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
