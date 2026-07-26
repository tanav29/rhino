import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { ChevronUp, Folder, Loader2, TerminalSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShellOption {
  name: string;
  value: string;
}

interface BrowseEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  error?: string;
}

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
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [pathInput, setPathInput] = useState(initialPath);
  const [loading, setLoading] = useState(false);

  const loadPath = async (path: string) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/browse?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error("Unable to browse");
      const data = (await response.json()) as BrowseResult;
      setBrowse(data);
      setPathInput(data.path);
    } catch {
      setBrowse({ path, parent: null, entries: [], error: "Unable to reach server" });
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
          <DialogTitle>New terminal</DialogTitle>
          <DialogDescription>Choose a shell and starting directory.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Shell
            <select
              value={shell}
              onChange={(event) => setShell(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Default shell</option>
              {shells.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Directory</span>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadPath(pathInput);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
                spellCheck={false}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button type="submit" variant="outline" size="sm">
                Go
              </Button>
            </form>
            <div className="h-48 overflow-y-auto rounded-md border border-border">
              {loading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : browse?.error ? (
                <p className="p-3 text-xs text-destructive">{browse.error}</p>
              ) : (
                <>
                  {browse?.parent && (
                    <button
                      type="button"
                      aria-label="Go to parent directory"
                      onClick={() => loadPath(browse.parent!)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ChevronUp size={13} />
                      Up a level
                    </button>
                  )}
                  {browse?.entries.length === 0 && (
                    <p className="p-3 text-xs text-muted-foreground">No subfolders</p>
                  )}
                  {browse?.entries.map((entry) => (
                    <button
                      type="button"
                      aria-label={`Open ${entry.name}`}
                      key={entry.path}
                      onClick={() => loadPath(entry.path)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Folder size={13} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{entry.name}</span>
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
