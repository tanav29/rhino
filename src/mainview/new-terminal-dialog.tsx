import { useEffect, useState } from "react";
import { ChevronUp, Folder, Loader2, TerminalSquare } from "lucide-react";
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

        <div className="flex flex-col gap-4 px-5 pb-4 pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Shell</span>
            <select
              value={shell}
              onChange={(event) => setShell(event.target.value)}
              className="h-8 rounded-[8px] border border-border bg-accent px-2.5 font-mono text-[12.5px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                className="h-8 min-w-0 flex-1 rounded-[8px] border border-border bg-background px-2.5 font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder="/path/to/project"
              />
              <Button type="submit" variant="outline" size="sm">
                Go
              </Button>
            </form>
            <div className="h-52 overflow-y-auto rounded-[8px] border border-border bg-sidebar">
              {loading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
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
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Folder size={13} className="shrink-0 text-muted-foreground" />
                      <span className="truncate font-[450] tracking-tight">{entry.name}</span>
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
