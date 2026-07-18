"use client";

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
} from "lucide-react";

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
        console.log(availableShells)
        setShells(availableShells);
      })
      .catch(() => setShells([]));
  }, []);

  return (
    <div className="flex w-52 flex-col border-r border-white/10 bg-white/3">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium tracking-wide text-white/40">
          SESSIONS
        </span>
        {/*<button
          onClick={onNew}
          title="New session"
          className="flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
          <Plus size={16} />
        </button>*/}

        <ButtonGroup>
          <Button variant={"outline"} size={"icon-sm"} onClick={() => onNew()}>
            <Plus size={16} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="More Options"
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-40">
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
              className={`group flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <span className="truncate text-xs line-clamp-2">
                {session.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                title="Close session"
                className="hidden shrink-0 items-center justify-center rounded text-white/40 hover:text-white group-hover:flex"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
