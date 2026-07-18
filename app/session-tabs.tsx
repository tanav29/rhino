"use client";

import { Plus, X, TerminalSquare } from "lucide-react";

export interface SessionTab {
  id: string;
  title: string;
}

interface SessionTabsProps {
  sessions: SessionTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function SessionTabs({
  sessions,
  activeId,
  onSelect,
  onClose,
  onNew,
}: SessionTabsProps) {
  return (
    <div className="flex w-52 flex-col border-r border-white/10 bg-white/3">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-medium tracking-wide text-white/40">
          SESSIONS
        </span>
        <button
          onClick={onNew}
          title="New session"
          className="flex h-6 w-6 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto px-2 pb-2">
        {sessions.map((session) => {
          const isActive = session.id === activeId;
          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <TerminalSquare size={15} className="shrink-0" />
              <span className="flex-1 truncate">{session.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                title="Close session"
                className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white group-hover:flex"
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
