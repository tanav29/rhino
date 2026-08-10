import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, X, Terminal, ChevronDown, PanelLeftOpen, PanelRightOpen } from "lucide-react";
import {
  VscTerminalBash,
  VscTerminalCmd,
  VscTerminalGitBash,
  VscTerminalPowershell,
  VscTerminalUbuntu,
} from "react-icons/vsc";

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
  shells: { name: string; value: string }[];
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
  shells,
  panel,
  onPanelToggle,
}: SessionTabsProps) {
  return (
    <div className="flex h-8 shrink-0 items-center border-b border-border bg-background">
      <div className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
        <button
          type="button"
          aria-label="Toggle files panel"
          onClick={() => onPanelToggle?.(panel === "files" ? null : "files")}
          className={`flex size-6 items-center justify-center rounded hover:bg-accent hover:text-foreground ${panel === "files" ? "bg-accent text-foreground" : ""}`}
          title="Files"
        >
          <PanelRightOpen size={13} />
        </button>
      </div>
      <div className="flex h-full items-center gap-px overflow-x-auto scrollbar-none">
        {sessions.map((session) => {
          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(session.id);
              }}
              role="button"
              tabIndex={0}
              className={`group flex h-full cursor-pointer items-center gap-1.5 px-2 text-xs transition-colors ${
                session.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              }`}
            >
              <ShellIcon shell={session.shell} />
              <span className="max-w-28 truncate">{session.title}</span>
              <button
                type="button"
                aria-label={`Close ${session.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-0.5 px-1">
        <button
          type="button"
          aria-label="New terminal"
          onClick={() => onNew()}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus size={14} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Choose shell"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
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
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="ml-auto flex items-center px-2">
        <button
          type="button"
          aria-label={panel ? "Close workspace panel" : "Open workspace panel"}
          onClick={() => onPanelToggle?.(panel ? null : "files")}
          className={`flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${panel ? "bg-accent text-foreground" : ""}`}
          title={panel ? "Close workspace panel" : "Open workspace panel"}
        >
          <PanelLeftOpen size={13} />
        </button>
      </div>
    </div>
  );
}
