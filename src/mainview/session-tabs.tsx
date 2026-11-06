import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, X, Terminal, ChevronDown, PanelLeftOpen, Settings, Bot } from "lucide-react";

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
  panel?: "files" | "git" | null;
  onPanelToggle?: (panel: "files" | "git" | null) => void;
  onSettings?: () => void;
}

const agentTitle = /(?:^|[^a-z0-9])(opencode|claude|codex|cursor|gemini|aider)(?:$|[^a-z0-9])/i;

export function SessionTabs({
  sessions,
  activeId,
  onSelect,
  onClose,
  onNew,
  shells,
  panel,
  onPanelToggle,
  onSettings,
}: SessionTabsProps) {
  return (
    <div className="flex h-8 shrink-0 items-center border-b border-white/10 bg-[#0f0f0f]">
      <div className="flex h-full min-w-0 items-stretch gap-0 overflow-x-auto scrollbar-none">
        {sessions.map((session) => {
          const active = session.id === activeId;
          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(session.id);
              }}
              role="button"
              tabIndex={0}
              className={`group relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r px-2 text-xs transition-none select-none ${
                active
                  ? "bg-white/[0.08] text-zinc-100 border-white/10"
                  : "border-white/10 bg-transparent text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
              }`}
            >
              {agentTitle.test(session.title) ? (
                <Bot size={14} aria-label="AI agent" />
              ) : (
                <Terminal size={14} />
              )}
              <span className="max-w-[110px] truncate text-xs">
                {session.title}
              </span>
              <button
                type="button"
                aria-label={`Close ${session.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                className={`flex size-5 shrink-0 items-center justify-center transition-colors ${
                  active
                    ? "text-zinc-500  hover:text-zinc-100"
                    : "text-zinc-600 opacity-0  hover:text-zinc-100 group-hover:opacity-100"
                }`}
              >
                <X size={11} strokeWidth={2.2} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center pl-1 pr-1">
        <button
          type="button"
          aria-label="New terminal"
          onClick={() => onNew()}
          className="flex size-4 items-center justify-center text-zinc-500 hover:text-zinc-100 transition-colors"
          title="New terminal (Ctrl+T)"
        >
          <Plus size={14} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Choose shell"
                className="flex size-4 items-center justify-center text-zinc-500  hover:text-zinc-100 transition-colors"
              >
                <ChevronDown size={14} />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-52">
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
      <div className="ml-auto flex items-center gap-1 pl-2 pr-2">
        <button
          type="button"
          aria-label="Terminal settings"
          onClick={() => onSettings?.()}
          className="flex size-4 items-center justify-center  text-zinc-500 transition-colors  hover:text-zinc-100"
          title="Terminal settings"
        >
          <Settings size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label={panel ? "Close workspace panel" : "Open workspace panel"}
          onClick={() => onPanelToggle?.(panel ? null : "files")}
          className={`flex size-4 items-center justify-center transition-colors ${panel ? " text-zinc-100" : "text-zinc-500  hover:text-zinc-100"}`}
          title={panel ? "Close workspace panel" : "Open workspace panel"}
        >
          <PanelLeftOpen size={14} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
