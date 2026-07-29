import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, TerminalSquare, Trash2, X, Search } from "lucide-react";
import { SessionTabs, type SessionTab } from "./session-tabs";
import { closeSessionSocket } from "./session-sockets";
import { SessionView } from "./session-view";
import { apiBase } from "./api-base";
import { FilesPanel } from "./file-tree-panel";
import { GitPanel } from "./git-panel";
import { NewSessionDialog } from "./new-terminal-dialog";

export interface Project {
  id: string;
  name: string;
  path: string;
  sessions: SessionTab[];
}

interface Pane {
  id: string;
  sessionId: string;
  direction?: "row" | "column";
}

const STORAGE_KEY = "term.workspace:v1";
const DEFAULT_SHELL_STORAGE_KEY = "term.default-shell";
let counter = 0;
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newSession = (cwd?: string, shell?: string): SessionTab => ({
  id: uuid(),
  title: `Terminal ${++counter}`,
  cwd,
  shell,
});
const newProject = (): Project => ({
  id: uuid(),
  name: "Workspace",
  path: ".",
  sessions: [newSession()],
});

function loadWorkspace(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (
      Array.isArray(parsed) &&
      parsed.length &&
      parsed.every((p) => p?.id && Array.isArray(p.sessions))
    )
      return parsed;
  } catch {
    /* use a clean workspace */
  }
  return [newProject()];
}

interface CommandItem {
  label: string;
  shortcut?: string;
  action: () => void;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [panes, setPanes] = useState<Pane[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<"files" | "git" | "info" | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [defaultShell, setDefaultShell] = useState<string>();
  const [newOpen, setNewOpen] = useState(false);
  const [shells, setShells] = useState<{ name: string; value: string }[]>([]);
  const lastSessionByProject = useRef<Record<string, string>>({});
  const project = projects.find((item) => item.id === activeProjectId);
  const sessions = project?.sessions ?? [];
  const activeSession = sessions.find((item) => item.id === activeSessionId);

  useEffect(() => {
    const fallback = loadWorkspace();
    fetch(`${apiBase}/api/workspace`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((remote) => {
        const loaded =
          remote?.projects?.length &&
          remote.projects.every(
            (p: Project) => p?.id && Array.isArray(p.sessions),
          )
            ? (remote.projects as Project[])
            : fallback;
        const projectId = loaded.some((p) => p.id === remote?.activeProjectId)
          ? remote.activeProjectId
          : loaded[0].id;
        const selectedProject =
          loaded.find((p) => p.id === projectId) ?? loaded[0];
        const sessionId = selectedProject.sessions.some(
          (s) => s.id === remote?.activeSessionId,
        )
          ? remote.activeSessionId
          : selectedProject.sessions[0].id;
        startTransition(() => {
          setProjects(loaded);
          setActiveProjectId(projectId);
          setActiveSessionId(sessionId);
          setPanes(
            Array.isArray(remote?.panes) && remote.panes.length
              ? remote.panes
              : [{ id: uuid(), sessionId }],
          );
          setDefaultShell(
            remote?.defaultShell ??
              localStorage.getItem(DEFAULT_SHELL_STORAGE_KEY) ??
              undefined,
          );
          setHydrated(true);
        });
      });
  }, []);
  useEffect(() => {
    if (!hydrated || !projects.length) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    void fetch(`${apiBase}/api/workspace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projects,
        activeProjectId,
        activeSessionId,
        panes,
        defaultShell,
      }),
    }).catch(() => undefined);
  }, [
    hydrated,
    projects,
    activeProjectId,
    activeSessionId,
    panes,
    defaultShell,
  ]);
  useEffect(() => {
    if (activeSession)
      document.title = `${activeSession.title} — ${project?.name ?? "Terminal"}`;
  }, [activeSession, project]);

  const addSession = useCallback(
    (shell?: string, cwd?: string) => {
      if (!project) return;
      const session = newSession(cwd || project.path, shell ?? defaultShell);
      setProjects((all) =>
        all.map((p) =>
          p.id === project.id
            ? { ...p, sessions: [...p.sessions, session] }
            : p,
        ),
      );
      setActiveSessionId(session.id);
      setPanes((all) =>
        all.length
          ? all.map((pane, index) =>
              index === 0 ? { ...pane, sessionId: session.id } : pane,
            )
          : all,
      );
      if (shell) {
        setDefaultShell(shell);
        localStorage.setItem(DEFAULT_SHELL_STORAGE_KEY, shell);
      }
    },
    [defaultShell, project],
  );
  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setActiveProjectId((projectId) => {
      lastSessionByProject.current[projectId] = id;
      return projectId;
    });
    setPanes((all) =>
      all.map((pane, index) =>
        index === 0 ? { ...pane, sessionId: id } : pane,
      ),
    );
  }, []);
  const updateTitle = useCallback(
    (id: string, title: string) =>
      setProjects((all) =>
        all.map((p) => ({
          ...p,
          sessions: p.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
        })),
      ),
    [],
  );
  const closeSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) return;
      closeSessionSocket(id);
      setProjects((all) =>
        all.map((p) =>
          p.id === activeProjectId
            ? { ...p, sessions: p.sessions.filter((s) => s.id !== id) }
            : p,
        ),
      );
      if (activeSessionId === id) {
        const next = sessions.find((s) => s.id !== id);
        if (next) selectSession(next.id);
      }
    },
    [activeProjectId, activeSessionId, sessions, selectSession],
  );
  const selectProject = (id: string) => {
    const next = projects.find((p) => p.id === id);
    if (!next) return;
    lastSessionByProject.current[activeProjectId] = activeSessionId;
    const sessionId = next.sessions.some(
      (session) => session.id === lastSessionByProject.current[id],
    )
      ? lastSessionByProject.current[id]
      : next.sessions[0].id;
    setActiveProjectId(id);
    setActiveSessionId(sessionId);
    setPanes([{ id: uuid(), sessionId }]);
  };
  const addProject = useCallback(() => setNewOpen(true), []);
  const removeProject = (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const count = target.sessions.length;
    if (
      !window.confirm(
        `Delete workspace "${target.name}"? This closes ${count} terminal${count === 1 ? "" : "s"}.`,
      )
    )
      return;
    target.sessions.forEach((s) => closeSessionSocket(s.id));
    const remaining = projects.filter((p) => p.id !== id);
    const fallback = remaining.length ? remaining : [newProject()];
    setProjects(fallback);
    if (activeProjectId === id) {
      const next = fallback[0];
      setActiveProjectId(next.id);
      setActiveSessionId(next.sessions[0].id);
      setPanes([{ id: uuid(), sessionId: next.sessions[0].id }]);
    }
  };

  const split = useCallback(
    (direction: "row" | "column") => {
      if (!activeSession || !project) return;
      const session = newSession(
        activeSession.cwd || project.path,
        activeSession.shell,
      );
      setProjects((all) =>
        all.map((p) =>
          p.id === project.id
            ? { ...p, sessions: [...p.sessions, session] }
            : p,
        ),
      );
      setActiveSessionId(session.id);
      setPanes((all) => [
        ...all.map((p, i) => (i === 0 ? { ...p, direction } : p)),
        { id: uuid(), sessionId: session.id, direction },
      ]);
    },
    [activeSession, project],
  );

  const commands: CommandItem[] = useMemo(
    () => [
      ...projects.map((p) => ({
        label: `Switch to ${p.name}`,
        action: () => {
          selectProject(p.id);
          setPaletteOpen(false);
        },
      })),
      {
        label: "New session",
        shortcut: "⌘T",
        action: () => {
          addSession();
          setPaletteOpen(false);
        },
      },
      {
        label: "Split right",
        shortcut: "⌘D",
        action: () => {
          split("row");
          setPaletteOpen(false);
        },
      },
      {
        label: "Split down",
        shortcut: "⌘⇧D",
        action: () => {
          split("column");
          setPaletteOpen(false);
        },
      },
      {
        label: "Files panel",
        shortcut: "⌘⇧F",
        action: () => {
          setPanel("files");
          setPaletteOpen(false);
        },
      },
      {
        label: "Git panel",
        shortcut: "⌘⇧G",
        action: () => {
          setPanel("git");
          setPaletteOpen(false);
        },
      },
      {
        label: "Session info",
        action: () => {
          setPanel("info");
          setPaletteOpen(false);
        },
      },
      {
        label: "Close panel",
        action: () => {
          setPanel(null);
          setPaletteOpen(false);
        },
      },
    ],
    [projects, addSession, split],
  );

  const filteredCommands = useMemo(() => {
    if (!paletteQuery) return commands;
    const q = paletteQuery.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, paletteQuery]);

  useEffect(() => {
    if (paletteOpen) {
      setPaletteQuery("");
      setTimeout(() => paletteInputRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (event.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      }
      if (mod && event.key.toLowerCase() === "t") {
        event.preventDefault();
        addSession();
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        split(event.shiftKey ? "column" : "row");
      }
      if (mod && event.key.toLowerCase() === "n") {
        event.preventDefault();
        addProject();
      }
      if (mod && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        selectProject(projects[Number(event.key) - 1]?.id ?? "");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addSession, projects, project, activeSession, split, paletteOpen]);

  useEffect(() => {
    fetch(`${apiBase}/api/shells`)
      .then((response) => response.json())
      .then(setShells)
      .catch(() => setShells([]));
  }, []);

  if (!hydrated) return <div className="h-screen bg-background" />;

  const paneSessions = panes.map((pane) => {
    const s =
      sessions.find((sess) => sess.id === pane.sessionId) ?? activeSession;
    return { ...pane, session: s };
  });
  const allSessions = projects.flatMap((item) => item.sessions);
  const paneCount = paneSessions.length;
  const splitColumn = panes[0]?.direction === "column";

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-background">
        {/* <div className="flex items-center gap-2 border-b border-border px-3 h-8">
          <TerminalSquare size={16} className="text-gray-400" />
          <span className="text-xs font-medium tracking-wide text-sidebar-foreground/50">
            PROJECTS
          </span>
        </div> */}
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => selectProject(p.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  selectProject(p.id);
              }}
              role="button"
              tabIndex={0}
              className={`group flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left text-sm cursor-pointer ${
                p.id === activeProjectId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}>
              <div className="flex w-full items-center gap-2">
                <span className="truncate text-xs font-medium">{p.name}</span>
                <button
                  type="button"
                  aria-label={`Delete workspace ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeProject(p.id);
                  }}
                  title="Delete workspace"
                  className="ml-auto flex size-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/40 opacity-0 hover:text-destructive group-hover:opacity-100">
                  <Trash2 size={12} />
                </button>
              </div>
              <span className="truncate text-[11px] text-sidebar-foreground/40 w-full">
                {p.path}
              </span>
            </div>
          ))}
          <button
            type="button"
            aria-label="New project"
            onClick={addProject}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
            <Plus size={14} />
            <span>New project</span>
          </button>
        </div>
      </aside>
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SessionTabs
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={selectSession}
          onClose={closeSession}
          onNew={addSession}
          shells={shells}
          projectName={project?.name}
          panel={panel}
          onPanelToggle={setPanel}
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {allSessions.map((session) => {
            const paneIndex = paneSessions.findIndex(
              (pane) => pane.session?.id === session.id,
            );
            const visible = paneIndex >= 0 && paneCount > 0;
            const size = visible ? `${100 / paneCount}%` : "0";
            const isLast = paneIndex === paneCount - 1;
            return (
              <div
                key={session.id}
                className="absolute overflow-hidden"
                style={{
                  display: visible ? "block" : "none",
                  top: splitColumn ? `${paneIndex * (100 / paneCount)}%` : 0,
                  left: splitColumn ? 0 : `${paneIndex * (100 / paneCount)}%`,
                  height: splitColumn ? size : "100%",
                  width: splitColumn ? "100%" : size,
                  borderRight:
                    visible && !isLast && !splitColumn
                      ? "1px solid var(--border)"
                      : undefined,
                  borderBottom:
                    visible && !isLast && splitColumn
                      ? "1px solid var(--border)"
                      : undefined,
                }}>
                <SessionView
                  session={session}
                  onTitle={updateTitle}
                  active={session.id === activeSessionId}
                  visible={visible}
                />
              </div>
            );
          })}
        </div>
      </main>
      {panel && (
        <WorkspacePanel
          type={panel}
          project={project}
          onClose={() => setPanel(null)}
        />
      )}
      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        shells={shells}
        initialPath={project?.path ?? "."}
        onCreate={(shell, cwd) => {
          if (!cwd) return;
          const session = newSession(cwd, shell);
          const p: Project = {
            id: uuid(),
            name:
              cwd.split(/[\\/]/).filter(Boolean).pop() ||
              `Project ${projects.length + 1}`,
            path: cwd,
            sessions: [session],
          };
          setProjects((all) => [...all, p]);
          setActiveProjectId(p.id);
          setActiveSessionId(p.sessions[0].id);
          setPanes([{ id: uuid(), sessionId: p.sessions[0].id }]);
        }}
      />
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          onClick={() => setPaletteOpen(false)}>
          <div className="fixed inset-0 bg-black/50" />
          <div
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search size={14} className="shrink-0 text-muted-foreground" />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Type a command..."
                className="h-10 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <kbd className="pointer-events-none shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredCommands.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No commands found
                </p>
              ) : (
                filteredCommands.map((cmd) => (
                  <button
                    key={cmd.label}
                    type="button"
                    onClick={cmd.action}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspacePanel({
  type,
  project,
  onClose,
}: {
  type: "files" | "git" | "info";
  project?: Project;
  onClose: () => void;
}) {
  const wide = type === "files" || type === "git";
  return (
    <aside
      className={`flex ${wide ? "w-80" : "w-72"} shrink-0 flex-col overflow-hidden border-l border-border bg-background text-sm text-sidebar-foreground`}>
      <div className="flex items-center justify-between border-b border-border px-3 h-8">
        <span className="font-medium">
          {type === "files" ? "Files" : type === "git" ? "Git" : "Shortcuts"}
        </span>
        <button
          type="button"
          aria-label="Close workspace panel"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {type === "files" &&
          (project ? (
            <FilesPanel cwd={project.path} />
          ) : (
            <p className="p-4 text-sidebar-foreground/60">
              No project selected.
            </p>
          ))}
        {type === "git" && <GitPanel cwd={project?.path} />}
        {type === "info" && (
          <div className="flex flex-col gap-4 p-4">
            <div>
              <h3 className="mb-2 text-xs font-medium text-sidebar-foreground/80">
                Navigation
              </h3>
              <div className="flex flex-col gap-1.5">
                <ShortcutRow keys={["⌘", "T"]} label="New terminal" />
                <ShortcutRow keys={["⌘", "D"]} label="Split right" />
                <ShortcutRow keys={["⌘", "⇧", "D"]} label="Split down" />
                <ShortcutRow keys={["⌘", "N"]} label="New workspace" />
                <ShortcutRow keys={["⌘", "P"]} label="Command palette" />
                <ShortcutRow keys={["⌘", "1-9"]} label="Switch workspace" />
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium text-sidebar-foreground/80">
                Panels
              </h3>
              <div className="flex flex-col gap-1.5">
                <ShortcutRow keys={["⌘", "⇧", "F"]} label="Files panel" />
                <ShortcutRow keys={["⌘", "⇧", "G"]} label="Git panel" />
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium text-sidebar-foreground/80">
                Shell
              </h3>
              <p className="text-xs text-sidebar-foreground/50">
                Run{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  tasklist
                </code>{" "}
                or{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  netstat -ano
                </code>{" "}
                to inspect processes and ports.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-sidebar-foreground/60">{label}</span>
      <div className="flex items-center gap-0.5">
        {keys.map((key, i) => (
          <kbd
            key={i}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}
