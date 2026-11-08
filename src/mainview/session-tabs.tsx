import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useRef } from "react";
import { Plus, X, Terminal, ChevronDown, PanelRight, Settings } from "lucide-react";
import { AgentIcon } from "./agent-icon";

export interface SessionTab {
  id: string;
  title: string;
  shell?: string;
  cwd?: string;
}

interface SessionTabsProps {
  sessions: SessionTab[];
  agents: { sessionId: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (shell?: string, cwd?: string) => void;
  shells: { name: string; value: string }[];
  panel?: "files" | "git" | null;
  onPanelToggle?: (panel: "files" | "git" | null) => void;
  onSettings?: () => void;
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
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-sidebar">
      <div
        ref={tabsRef}
        role="group"
        aria-label="Terminals"
        className="flex h-full min-w-0 items-stretch overflow-x-auto scrollbar-none"
      >
        {sessions.map((session) => {
          const active = session.id === activeId;
          const executable = session.title.split(/[\\/]/).pop()?.toLowerCase();
          const title =
            shells.find((shell) => shell.value.split(/[\\/]/).pop()?.toLowerCase() === executable)
              ?.name ?? session.title;
          const agent =
            agents.find((item) => item.sessionId === session.id)?.name ??
            session.title.match(agentTitle)?.[1];
          return (
            <div
              key={session.id}
              className={`group relative flex shrink-0 items-center border-r border-b-2 pr-1 text-xs transition-colors select-none ${
                active
                  ? "border-r-border border-b-ring bg-background text-foreground"
                  : "border-r-border border-b-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                aria-label={agent ? `${agent}: ${title}` : undefined}
                title={session.cwd ? `${session.title} — ${session.cwd}` : session.title}
                aria-pressed={active}
                className="flex h-full min-w-0 items-center gap-2 px-3 text-left"
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
                className={`flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-accent ${
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
      <div className="flex shrink-0 items-center px-1">
        <button
          type="button"
          aria-label="New terminal"
          onClick={() => onNew()}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
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
      <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-border px-2">
        <button
          type="button"
          aria-label="Terminal settings"
          onClick={() => onSettings?.()}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Terminal settings"
        >
          <Settings size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label={panel ? "Close workspace panel" : "Open workspace panel"}
          onClick={() => onPanelToggle?.(panel ? null : "files")}
          aria-pressed={!!panel}
          className={`flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent ${panel ? "bg-accent text-ring" : "text-muted-foreground hover:text-foreground"}`}
          title={panel ? "Close workspace panel" : "Open workspace panel"}
        >
          <PanelRight size={14} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
