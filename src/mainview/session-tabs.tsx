import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useRef } from "react";
import { Plus, X, Terminal, ChevronDown, PanelRight, Settings, PanelLeft } from "lucide-react";
import { AgentIcon } from "./agent-icon";
import { MachineSelector } from "./machine-selector";
import type { AgentInfo } from "../shared/rpc-schema";

export interface SessionTab {
  id: string;
  title: string;
  shell?: string;
  cwd?: string;
  sourceSessionId?: string;
}

interface SessionTabsProps {
  sessions: SessionTab[];
  agents: AgentInfo[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (shell?: string, cwd?: string) => void;
  shells: { name: string; value: string }[];
  panel?: "files" | "git" | null;
  onPanelToggle?: (panel: "files" | "git" | null) => void;
  onSettings?: () => void;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}

const agentTitle =
  /(?:^|[^a-z0-9])(opencode|claude|codex|cursor|gemini|aider|copilot)(?:$|[^a-z0-9])/i;

export function SessionTabs({
  sessions,
  agents,
  activeId,
  onSelect,
  onClose,
  onNew,
  shells,
  panel,
  onPanelToggle,
  onSettings,
  sidebarCollapsed,
  onSidebarToggle,
}: SessionTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const revealActive = () =>
      tabs.querySelector('[aria-pressed="true"]')?.parentElement?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [activeId, sessions, shells]);

  return (
    <div className="flex h-10 shrink-0 items-center px-1.5">
      <div className="flex h-full shrink-0 items-center">
        <button
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          aria-controls="workspace-sidebar"
          onClick={onSidebarToggle}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground  hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring  aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <PanelLeft size={14} />
        </button>
      </div>
      <div
        ref={tabsRef}
        role="group"
        aria-label="Terminals"
        className="flex h-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sessions.map((session) => {
          const active = session.id === activeId;
          const executable = session.title.split(/[\\/]/).pop()?.toLowerCase();
          const title =
            shells.find((shell) => shell.value.split(/[\\/]/).pop()?.toLowerCase() === executable)
              ?.name ?? session.title;
          const agentInfo = agents.find((item) => item.sessionId === session.id);
          const agent = agentInfo?.name ?? session.title.match(agentTitle)?.[1];
          return (
            <div
              key={session.id}
              className={`group relative flex h-7 shrink-0 items-center rounded-full border text-xs select-none ${
                active
                  ? "border-(--chrome-border) bg-[color-mix(in_srgb,var(--foreground)_8%,var(--sidebar))] text-foreground"
                  : "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                aria-label={agent ? `${agent}: ${title}` : undefined}
                title={session.cwd ? `${session.title} — ${session.cwd}` : session.title}
                aria-pressed={active}
                className="flex h-full min-w-0 items-center gap-1.5 px-2 text-left"
              >
                {agent ? <AgentIcon name={agent} /> : <Terminal size={14} />}
                <span className="max-w-40 truncate text-xs">{title}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${title}`}
                title={`Close ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                className={`mr-1 flex size-6 shrink-0 items-center justify-center rounded-full ${
                  active
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
                }`}
              >
                <X size={11} strokeWidth={2.2} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label="New terminal"
          onClick={() => onNew()}
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
                title="Choose shell"
                disabled={shells.length === 0}
                className="flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
      <div className="ml-auto flex shrink-0 items-center pl-2">
        <button
          type="button"
          aria-label="Settings"
          onClick={() => onSettings?.()}
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50"
          title="Settings"
        >
          <Settings size={14} strokeWidth={1.8} />
        </button>
        <MachineSelector />
        <button
          type="button"
          aria-label={panel ? "Close workspace panel" : "Open workspace panel"}
          onClick={() => onPanelToggle?.(panel ? null : "files")}
          aria-pressed={!!panel}
          className={`flex size-6 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-ring aria-expanded:text-foreground disabled:pointer-events-none disabled:opacity-50 ${panel ? "text-ring" : "text-muted-foreground hover:text-foreground"}`}
          title={panel ? "Close workspace panel" : "Open workspace panel"}
        >
          <PanelRight size={14} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
