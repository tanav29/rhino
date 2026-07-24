import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { GitCommit, Plus, Search, TerminalSquare, Trash2, X } from "lucide-react";
import { SessionTabs, type SessionTab } from "./session-tabs";
import { DebugToolbar } from "./debug-toolbar";
import { closeSessionSocket } from "./session-sockets";
import { SessionView } from "./session-view";

export interface Project { id: string; name: string; path: string; sessions: SessionTab[] }
interface Pane { id: string; direction?: "row" | "column" }
const STORAGE_KEY = "term.workspace";
const DEFAULT_SHELL_STORAGE_KEY = "term.default-shell";
let counter = 0;
const uuid = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newSession = (cwd?: string, shell?: string): SessionTab => ({ id: uuid(), title: `Terminal ${++counter}`, cwd, shell });
const newProject = (): Project => ({ id: uuid(), name: "Workspace", path: ".", sessions: [newSession()] });

function loadWorkspace(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length && parsed.every((p) => p?.id && Array.isArray(p.sessions))) return parsed;
  } catch { /* use a clean workspace */ }
  return [newProject()];
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [panes, setPanes] = useState<Pane[]>([]);
  const [palette, setPalette] = useState(false);
  const [panel, setPanel] = useState<"files" | "git" | "info" | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [defaultShell, setDefaultShell] = useState<string>();
  const project = projects.find((item) => item.id === activeProjectId);
  const sessions = project?.sessions ?? [];
  const activeSession = sessions.find((item) => item.id === activeSessionId);
  const allSessions = useMemo(() => projects.flatMap((p) => p.sessions), [projects]);

  useEffect(() => {
    const loaded = loadWorkspace();
    startTransition(() => {
      setProjects(loaded); setActiveProjectId(loaded[0].id); setActiveSessionId(loaded[0].sessions[0].id);
      setPanes([{ id: uuid() }]);
      setDefaultShell(localStorage.getItem(DEFAULT_SHELL_STORAGE_KEY) ?? undefined); setHydrated(true);
    });
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); }, [hydrated, projects]);
  useEffect(() => { if (activeSession) document.title = `${activeSession.title} — ${project?.name ?? "Terminal"}`; }, [activeSession, project]);

  const addSession = useCallback((shell?: string, cwd?: string) => {
    if (!project) return;
    const session = newSession(cwd || project.path, shell ?? defaultShell);
    setProjects((all) => all.map((p) => p.id === project.id ? { ...p, sessions: [...p.sessions, session] } : p));
    setActiveSessionId(session.id);
    if (shell) { setDefaultShell(shell); localStorage.setItem(DEFAULT_SHELL_STORAGE_KEY, shell); }
  }, [defaultShell, project]);
  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);
  const updateTitle = useCallback((id: string, title: string) => setProjects((all) => all.map((p) => ({ ...p, sessions: p.sessions.map((s) => s.id === id ? { ...s, title } : s) }))), []);
  const closeSession = useCallback((id: string) => {
    if (sessions.length <= 1) return;
    closeSessionSocket(id);
    setProjects((all) => all.map((p) => p.id === activeProjectId ? { ...p, sessions: p.sessions.filter((s) => s.id !== id) } : p));
    if (activeSessionId === id) {
      const next = sessions.find((s) => s.id !== id);
      if (next) selectSession(next.id);
    }
  }, [activeProjectId, activeSessionId, sessions, selectSession]);
  const selectProject = (id: string) => { const next = projects.find((p) => p.id === id); if (!next) return; setActiveProjectId(id); setActiveSessionId(next.sessions[0].id); setPanes([{ id: uuid() }]); };
  const addProject = () => {
    const path = window.prompt("Project directory", ".")?.trim();
    if (!path) return;
    const p = { ...newProject(), name: path.split(/[\\/]/).filter(Boolean).pop() || `Project ${projects.length + 1}`, path };
    setProjects((all) => [...all, p]); setActiveProjectId(p.id); setActiveSessionId(p.sessions[0].id); setPanes([{ id: uuid() }]);
  };
  const removeProject = (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const count = target.sessions.length;
    if (!window.confirm(`Delete workspace "${target.name}"? This closes ${count} terminal${count === 1 ? "" : "s"}.`)) return;
    target.sessions.forEach((s) => closeSessionSocket(s.id));
    const remaining = projects.filter((p) => p.id !== id);
    const fallback = remaining.length ? remaining : [newProject()];
    setProjects(fallback);
    if (activeProjectId === id) {
      const next = fallback[0];
      setActiveProjectId(next.id); setActiveSessionId(next.sessions[0].id); setPanes([{ id: uuid() }]);
    }
  };
  const split = (direction: "row" | "column") => { if (!activeSession) return; setPanes((all) => [...all, { id: uuid(), direction }]); };
  const commands = useMemo(() => [
    ...projects.map((p) => ({ label: `Switch to ${p.name}`, action: () => selectProject(p.id) })),
    { label: "New session", action: () => addSession() }, { label: "Split right", action: () => split("row") }, { label: "Split down", action: () => split("column") },
    { label: "Files panel", action: () => setPanel("files") }, { label: "Git panel", action: () => setPanel("git") }, { label: "Session info", action: () => setPanel("info") },
  ], [projects, project, activeSession, addSession]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "p") { event.preventDefault(); setPalette((value) => !value); }
      if (mod && event.key.toLowerCase() === "t") { event.preventDefault(); addSession(); }
      if (mod && event.key.toLowerCase() === "d") { event.preventDefault(); split(event.shiftKey ? "column" : "row"); }
      if (mod && event.key.toLowerCase() === "n") { event.preventDefault(); addProject(); }
      if (mod && /^[1-9]$/.test(event.key)) { event.preventDefault(); selectProject(projects[Number(event.key) - 1]?.id ?? ""); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [addSession, projects, project, activeSession]);
  if (!hydrated) return <div className="h-screen bg-background" />;

  return <div className="flex h-screen overflow-hidden bg-background text-foreground">
    <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <TerminalSquare size={16} className="text-cyan-400" />
        <span className="text-xs font-medium tracking-wide text-sidebar-foreground/50">PROJECTS</span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {projects.map((p, index) => (
          <div
            key={p.id}
            onClick={() => selectProject(p.id)}
            className={`group flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer ${
              p.id === activeProjectId
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
          >
            <div className="flex w-full items-center gap-2">
              <span className="text-xs font-medium">{index + 1}</span>
              <span className="truncate text-xs font-medium">{p.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeProject(p.id); }}
                title="Delete workspace"
                className="ml-auto flex size-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/40 opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <span className="truncate pl-4 text-[11px] text-sidebar-foreground/40">{p.path}</span>
          </div>
        ))}
        <button
          onClick={addProject}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <Plus size={14} />
          <span>New project</span>
        </button>
      </div>
      <div className="border-t border-border p-2">
        <button
          onClick={() => setPalette(true)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <Search size={14} />
          <span>Commands</span>
        </button>
      </div>
    </aside>
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <SessionTabs sessions={sessions} activeId={activeSessionId} onSelect={selectSession} onClose={closeSession} onNew={addSession} projectName={project?.name} projectPath={project?.path} panel={panel} onPanelToggle={setPanel} />
      {activeSession && <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {allSessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
                style={{ visibility: isActive ? "visible" : "hidden", zIndex: isActive ? 1 : 0, pointerEvents: isActive ? "auto" : "none" }}
              >
                <SessionView session={s} onTitle={updateTitle} active={isActive} />
              </div>
            );
          })}
        </div>
        {panes.slice(1).map((pane) => <div key={pane.id} className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ borderRightWidth: pane.direction === "row" ? 1 : 0, borderBottomWidth: pane.direction === "column" ? 1 : 0 }}><SessionView key={`${activeSession.id}-${pane.id}`} session={activeSession} onTitle={updateTitle} /></div>)}
      </div>}
    </main>
    {panel && <WorkspacePanel type={panel} project={project} onClose={() => setPanel(null)} />}
    {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
    {new URLSearchParams(window.location.search).has("debug") && <DebugToolbar />}
  </div>;
}

function CommandPalette({ commands, onClose }: { commands: { label: string; action: () => void }[]; onClose: () => void }) {
  const [query, setQuery] = useState(""); const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 bg-background/80 p-[12vh]" onClick={onClose}><div className="mx-auto max-w-lg overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl" onClick={(e) => e.stopPropagation()}><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Jump to project, session, or command…" className="w-full border-b border-border bg-transparent p-4 text-sm outline-none" /><div className="max-h-80 overflow-y-auto py-1">{filtered.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">No matching commands</p> : filtered.map((command) => <button key={command.label} onClick={() => { command.action(); onClose(); }} className="block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground">{command.label}</button>)}</div></div></div>;
}

function WorkspacePanel({ type, project, onClose }: { type: "files" | "git" | "info"; project?: Project; onClose: () => void }) {
  return <aside className="w-80 shrink-0 overflow-auto border-l border-border bg-sidebar p-4 text-sm text-sidebar-foreground"><div className="mb-4 flex items-center justify-between"><span className="font-medium">{type === "files" ? "Files" : type === "git" ? "Git" : "Session info"}</span><button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={15} /></button></div>{type === "files" && <p className="text-sidebar-foreground/60">Working tree: {project?.path}<br />Use the terminal to open and edit files.</p>}{type === "git" && <GitPanel cwd={project?.path} />}{type === "info" && <p className="text-sidebar-foreground/60">Processes and listening TCP ports are available from the active shell with <code>tasklist</code> or <code>netstat -ano</code>.</p>}</aside>;
}
function GitPanel({ cwd }: { cwd?: string }) { const [status, setStatus] = useState<string>("Loading…"); useEffect(() => { fetch(`/api/git/status?cwd=${encodeURIComponent(cwd ?? ".")}`).then((r) => r.text()).then(setStatus).catch(() => setStatus("Git unavailable")); }, [cwd]); return <><div className="mb-2 flex items-center gap-2 text-muted-foreground"><GitCommit size={14} />Changes</div><pre className="whitespace-pre-wrap text-xs text-muted-foreground">{status}</pre></>; }
