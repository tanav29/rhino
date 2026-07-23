import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Folder, GitBranch, GitCommit, PanelLeft, Plus, Search, Settings2, TerminalSquare, X } from "lucide-react";
import { SessionTabs, type SessionTab } from "./session-tabs";
import { DebugToolbar } from "./debug-toolbar";
import { closeSessionSocket } from "./session-sockets";
import { SessionView } from "./session-view";

export interface Project { id: string; name: string; path: string; sessions: SessionTab[] }
interface Pane { id: string; sessionId: string; direction?: "row" | "column" }
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

  useEffect(() => {
    const loaded = loadWorkspace();
    startTransition(() => {
      setProjects(loaded); setActiveProjectId(loaded[0].id); setActiveSessionId(loaded[0].sessions[0].id);
      setPanes([{ id: uuid(), sessionId: loaded[0].sessions[0].id }]);
      setDefaultShell(localStorage.getItem(DEFAULT_SHELL_STORAGE_KEY) ?? undefined); setHydrated(true);
    });
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); }, [hydrated, projects]);
  useEffect(() => { if (activeSession) document.title = `${activeSession.title} — ${project?.name ?? "Terminal"}`; }, [activeSession, project]);

  const addSession = useCallback((shell?: string) => {
    if (!project) return;
    const session = newSession(project.path, shell ?? defaultShell);
    setProjects((all) => all.map((p) => p.id === project.id ? { ...p, sessions: [...p.sessions, session] } : p));
    setActiveSessionId(session.id); setPanes((all) => [...all, { id: uuid(), sessionId: session.id }]);
    if (shell) { setDefaultShell(shell); localStorage.setItem(DEFAULT_SHELL_STORAGE_KEY, shell); }
  }, [defaultShell, project]);
  const updateTitle = useCallback((id: string, title: string) => setProjects((all) => all.map((p) => ({ ...p, sessions: p.sessions.map((s) => s.id === id ? { ...s, title } : s) }))), []);
  const closeSession = useCallback((id: string) => {
    closeSessionSocket(id);
    setProjects((all) => all.map((p) => p.id === activeProjectId ? { ...p, sessions: p.sessions.length === 1 ? p.sessions : p.sessions.filter((s) => s.id !== id) } : p));
    setPanes((all) => all.filter((pane) => pane.sessionId !== id));
    if (activeSessionId === id) setActiveSessionId(sessions.find((s) => s.id !== id)?.id ?? activeSessionId);
  }, [activeProjectId, activeSessionId, sessions]);
  const selectProject = (id: string) => { const next = projects.find((p) => p.id === id); if (!next) return; setActiveProjectId(id); setActiveSessionId(next.sessions[0].id); setPanes([{ id: uuid(), sessionId: next.sessions[0].id }]); };
  const addProject = () => {
    const path = window.prompt("Project directory", ".")?.trim();
    if (!path) return;
    const p = { ...newProject(), name: path.split(/[\\/]/).filter(Boolean).pop() || `Project ${projects.length + 1}`, path };
    setProjects((all) => [...all, p]); setActiveProjectId(p.id); setActiveSessionId(p.sessions[0].id); setPanes([{ id: uuid(), sessionId: p.sessions[0].id }]);
  };
  const split = (direction: "row" | "column") => { if (!activeSession) return; setPanes((all) => [...all, { id: uuid(), sessionId: activeSession.id, direction }]); };
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
  if (!hydrated) return <div className="h-screen bg-[#1a1b26]" />;

  return <div className="flex h-screen overflow-hidden bg-[#1a1b26] text-white">
    <aside className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-white/10 bg-black/20 py-3">
      <TerminalSquare size={18} className="mb-3 text-cyan-300" />
      {projects.map((p, index) => <button key={p.id} title={`${p.name} (⌘${index + 1})`} onClick={() => selectProject(p.id)} className={`h-8 w-8 rounded text-xs ${p.id === activeProjectId ? "bg-cyan-400/20 text-cyan-200" : "text-white/50 hover:bg-white/10"}`}>{index + 1}</button>)}
      <button title="New project" onClick={addProject} className="rounded p-2 text-white/50 hover:bg-white/10"><Plus size={16} /></button>
      <button title="Command palette" onClick={() => setPalette(true)} className="mt-auto rounded p-2 text-white/50 hover:bg-white/10"><Search size={16} /></button>
    </aside>
    <SessionTabs sessions={sessions} activeId={activeSessionId} onSelect={setActiveSessionId} onClose={closeSession} onNew={addSession} />
    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="absolute left-3 top-2 z-10 flex items-center gap-2 rounded bg-black/30 px-2 py-1 text-xs text-white/50"><span>{project?.name}</span><span className="text-white/20">{project?.path}</span><button onClick={() => setPanel(panel === "files" ? null : "files")}><Folder size={13} /></button><button onClick={() => setPanel(panel === "git" ? null : "git")}><GitBranch size={13} /></button><button onClick={() => setPanel(panel === "info" ? null : "info")}><Settings2 size={13} /></button></div>
      <div className="flex h-full flex-wrap content-stretch">{panes.map((pane) => { const session = sessions.find((s) => s.id === pane.sessionId); return session ? <div key={pane.id} className="min-h-0 min-w-0 flex-1 basis-1/2 border-white/10" style={{ borderRightWidth: pane.direction === "row" ? 1 : 0, borderBottomWidth: pane.direction === "column" ? 1 : 0 }}><SessionView session={session} onTitle={updateTitle} /></div> : null; })}</div>
    </main>
    {panel && <WorkspacePanel type={panel} project={project} onClose={() => setPanel(null)} />}
    {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
    {new URLSearchParams(window.location.search).has("debug") && <DebugToolbar />}
  </div>;
}

function CommandPalette({ commands, onClose }: { commands: { label: string; action: () => void }[]; onClose: () => void }) {
  const [query, setQuery] = useState(""); const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="fixed inset-0 z-50 bg-black/60 p-[12vh]" onClick={onClose}><div className="mx-auto max-w-lg overflow-hidden rounded-lg border border-white/10 bg-[#24283b] shadow-2xl" onClick={(e) => e.stopPropagation()}><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Jump to project, session, or command…" className="w-full border-b border-white/10 bg-transparent p-4 text-sm outline-none" />{filtered.map((command) => <button key={command.label} onClick={() => { command.action(); onClose(); }} className="block w-full px-4 py-3 text-left text-sm hover:bg-white/10">{command.label}</button>)}</div></div>;
}

function WorkspacePanel({ type, project, onClose }: { type: "files" | "git" | "info"; project?: Project; onClose: () => void }) {
  return <aside className="w-80 shrink-0 overflow-auto border-l border-white/10 bg-[#202334] p-4 text-sm"><div className="mb-4 flex items-center justify-between"><span className="font-medium">{type === "files" ? "Files" : type === "git" ? "Git" : "Session info"}</span><button onClick={onClose}><X size={15} /></button></div>{type === "files" && <p className="text-white/50">Working tree: {project?.path}<br />Use the terminal to open and edit files.</p>}{type === "git" && <GitPanel cwd={project?.path} />}{type === "info" && <p className="text-white/50">Processes and listening TCP ports are available from the active shell with <code>tasklist</code> or <code>netstat -ano</code>.</p>}</aside>;
}
function GitPanel({ cwd }: { cwd?: string }) { const [status, setStatus] = useState<string>("Loading…"); useEffect(() => { fetch(`/api/git/status?cwd=${encodeURIComponent(cwd ?? ".")}`).then((r) => r.text()).then(setStatus).catch(() => setStatus("Git unavailable")); }, [cwd]); return <><div className="mb-2 flex items-center gap-2 text-white/60"><GitCommit size={14} />Changes</div><pre className="whitespace-pre-wrap text-xs text-white/60">{status}</pre></>; }
