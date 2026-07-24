import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  X,
  Terminal,
  ChevronDown,
  Folder,
  FolderCog,
  GitBranch,
  Settings2,
} from "lucide-react";
import { VscTerminalBash, VscTerminalCmd, VscTerminalGitBash, VscTerminalPowershell, VscTerminalUbuntu } from "react-icons/vsc";
import { Separator } from "@/components/ui/separator";
import { NewTerminalDialog } from "./new-terminal-dialog";

interface ShellOption {
  name: string;
  value: string;
}

export interface SessionTab {
  id: string;
  title: string;
  shell?: string;
  cwd?: string;
}

interface SessionTabsProps {
  sessions: SessionTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (shell?: string, cwd?: string) => void;
  projectName?: string;
  projectPath?: string;
  panel?: "files" | "git" | "info" | null;
  onPanelToggle?: (panel: "files" | "git" | "info" | null) => void;
}

const ShellIcon = ({ shell }: { shell?: string }) => {
  if (shell === "cmd.exe") return <VscTerminalCmd size={13} />;
  if (shell === "wsl.exe") return <VscTerminalUbuntu size={13} />;
  if (shell === "bash.exe") return <VscTerminalBash size={13} />;
  if (shell === "powershell.exe") return <VscTerminalPowershell size={13} />;
  if (shell === "git-bash.exe") return <VscTerminalGitBash size={13} />;
  return <Terminal size={13} />;
};

export function SessionTabs({
  sessions,
  activeId,
  onSelect,
  onClose,
  onNew,
  projectName,
  projectPath,
  panel,
  onPanelToggle,
}: SessionTabsProps) {
  const [shells, setShells] = React.useState<ShellOption[]>([]);
  const [newTerminalOpen, setNewTerminalOpen] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/shells")
      .then((response) => response.json())
      .then(setShells)
      .catch(() => setShells([]));
  }, []);

  return (
    <div className="flex h-8 shrink-0 items-center border-b border-border bg-background">
      <div className="flex h-full items-center gap-px px-1">
        {sessions.map((session) => {
          const isActive = session.id === activeId;
          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={`group flex h-full cursor-pointer items-center gap-1.5 border-b-2 px-2 text-xs transition-colors ${
                isActive
                  ? "border-cyan-400 bg-accent/50 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/30 hover:text-foreground/80"
              }`}
            >
              <ShellIcon shell={session.shell} />
              <span className="max-w-28 truncate">{session.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(session.id); }}
                className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-colors hover:bg-accent hover:text-foreground group-hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-0.5 pr-1">
        <button
          onClick={() => onNew()}
          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus size={14} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <ChevronDown size={12} />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuGroup>
              {shells.map((shell) => (
                <DropdownMenuItem key={shell.value} onClick={() => onNew(shell.value)}>
                  <Terminal size={14} />
                  {shell.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => {
                const target = window.prompt("SSH target (user@host or user@host:port)");
                if (target?.trim()) onNew(`ssh:${target.trim()}`);
              }}>
                <Terminal size={14} />
                SSH connection…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setNewTerminalOpen(true)}>
                <FolderCog size={14} />
                Choose directory…
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="ml-auto flex items-center gap-1 px-2 text-xs text-muted-foreground">
        <span className="truncate text-muted-foreground/80">{projectName}</span>
        <Separator orientation="vertical" className="mx-1 h-3.5" />
        <button onClick={() => onPanelToggle?.(panel === "files" ? null : "files")} className={`flex size-6 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground ${panel === "files" ? "bg-accent text-foreground" : ""}`} title="Files">
          <Folder size={13} />
        </button>
        <button onClick={() => onPanelToggle?.(panel === "git" ? null : "git")} className={`flex size-6 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground ${panel === "git" ? "bg-accent text-foreground" : ""}`} title="Git">
          <GitBranch size={13} />
        </button>
        <button onClick={() => onPanelToggle?.(panel === "info" ? null : "info")} className={`flex size-6 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground ${panel === "info" ? "bg-accent text-foreground" : ""}`} title="Info">
          <Settings2 size={13} />
        </button>
      </div>
      <NewTerminalDialog
        open={newTerminalOpen}
        onOpenChange={setNewTerminalOpen}
        shells={shells}
        initialPath={projectPath ?? "."}
        onCreate={(shell, cwd) => onNew(shell, cwd)}
      />
    </div>
  );
}
