import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
  MoreHorizontalIcon,
  Terminal,
  ChevronDown,
} from "lucide-react";
import { VscTerminalBash, VscTerminalCmd, VscTerminalGitBash, VscTerminalPowershell, VscTerminalUbuntu } from "react-icons/vsc";
import { SiOpencode } from "react-icons/si";


interface ShellOption {
  name: string;
  value: string;
}

export interface SessionTab {
  id: string;
  title: string;
  shell?: string;
}

interface SessionTabsProps {
  sessions: SessionTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (shell?: string) => void;
}

export function SessionTabs({
  sessions,
  activeId,
  onSelect,
  onClose,
  onNew,
}: SessionTabsProps) {
  const [shells, setShells] = React.useState<ShellOption[]>([]);

  React.useEffect(() => {
    fetch("/api/shells")
      .then((response) => response.json())
      .then((availableShells: ShellOption[]) => {
        setShells(availableShells);
      })
      .catch(() => setShells([]));
  }, []);

  return (
    <div className="flex w-52 flex-col border-r border-white/10 bg-white/3">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium tracking-wide text-white/40">
          SESSIONZ
        </span>
        <ButtonGroup>
          <Button variant={"ghost"} size={"icon-sm"} onClick={() => onNew()}>
            <Plus size={16} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More Options"
                >
                  <ChevronDown />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuGroup>
                {shells.map((shell) => (
                  <DropdownMenuItem
                    key={shell.value}
                    onClick={() => onNew(shell.value)}
                  >
                    <Terminal size={14} />
                    {shell.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto px-2 pb-2">
        {sessions.map((session) => {
          const isActive = session.id === activeId;
          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={`group flex flex-col items-center justify-between gap-2 rounded-md px-2 py-2 text-sm ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <div className="w-full overflow-clip items-center justify-between flex">
                <span className="truncate text-xs line-clamp-2">
                  {session.shell === "cmd.exe" ? <VscTerminalCmd /> :
                   session.shell === "wsl.exe" ? <VscTerminalUbuntu /> :
                   session.shell === "bash.exe" ? <VscTerminalBash /> :
                   session.shell === "powershell.exe" ? <VscTerminalPowershell /> :
                   session.shell === "git-bash.exe" ? <VscTerminalGitBash /> :
                   <Terminal size={13} />}
                  {/*{session.title == "Opencode" ? <SiOpencode /> : }*/}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(session.id);
                  }}
                  title="Close session"
                  className="shrink-0 items-center justify-center rounded text-white/40 hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>
              {/*<span className="w-full truncate text-xs line-clamp-2 cursor-default">
                {session.shell}
              </span>*/}
              <span className="w-full truncate text-xs line-clamp-2 cursor-default">
                {session.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
