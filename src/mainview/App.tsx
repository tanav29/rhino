import { lazy, Suspense, useEffect, useState } from "react";
import { Plus, Trash2, Folder, X, Pencil } from "lucide-react";
import { SessionTabs } from "./session-tabs";
import { SessionView } from "./session-view";
import { rpc } from "./rpc";
import { useWorkspaceStore, selectActiveSession } from "./store";

const FilesPanel = lazy(() => import("./file-tree-panel").then((m) => ({ default: m.FilesPanel })));
const GitPanel = lazy(() => import("./git-panel").then((m) => ({ default: m.GitPanel })));
const NewSessionDialog = lazy(() =>
  import("./new-terminal-dialog").then((m) => ({ default: m.NewSessionDialog })),
);
const SettingsDialog = lazy(() =>
  import("./settings-dialog").then((m) => ({ default: m.SettingsDialog })),
);

export type { Project } from "./store";

export default function App() {
  const [agents, setAgents] = useState<{ sessionId: string; name: string }[]>([]);
  const [editingGroup, setEditingGroup] = useState<{
    id: string | null;
    name: string;
    color: string;
  } | null>(null);
  const saveGroup = useWorkspaceStore((s) => s.saveGroup);
  const moveSession = useWorkspaceStore((s) => s.moveSession);
  const projects = useWorkspaceStore((s) => s.projects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const panes = useWorkspaceStore((s) => s.panes);
  const panel = useWorkspaceStore((s) => s.panel);
  const hydrated = useWorkspaceStore((s) => s.hydrated);
  const termFontSize = useWorkspaceStore((s) => s.termFontSize);
  const termLineHeight = useWorkspaceStore((s) => s.termLineHeight);
  const termCursorBlink = useWorkspaceStore((s) => s.termCursorBlink);
  const newOpen = useWorkspaceStore((s) => s.newOpen);
  const settingsOpen = useWorkspaceStore((s) => s.settingsOpen);
  const shells = useWorkspaceStore((s) => s.shells);
  const setPanel = useWorkspaceStore((s) => s.setPanel);
  const setNewOpen = useWorkspaceStore((s) => s.setNewOpen);
  const setSettingsOpen = useWorkspaceStore((s) => s.setSettingsOpen);
  const setTermFontSize = useWorkspaceStore((s) => s.setTermFontSize);
  const setTermLineHeight = useWorkspaceStore((s) => s.setTermLineHeight);
  const setTermCursorBlink = useWorkspaceStore((s) => s.setTermCursorBlink);
  const setShells = useWorkspaceStore((s) => s.setShells);
  const hydrate = useWorkspaceStore((s) => s.hydrate);
  const addSession = useWorkspaceStore((s) => s.addSession);
  const selectSession = useWorkspaceStore((s) => s.selectSession);
  const updateTitle = useWorkspaceStore((s) => s.updateTitle);
  const closeSession = useWorkspaceStore((s) => s.closeSession);
  const selectProject = useWorkspaceStore((s) => s.selectProject);
  const removeProject = useWorkspaceStore((s) => s.removeProject);
  const createProject = useWorkspaceStore((s) => s.createProject);
  const split = useWorkspaceStore((s) => s.split);

  const project = useWorkspaceStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const sessions = project?.sessions ?? [];
  const activeSession = useWorkspaceStore(selectActiveSession);
  const defaultShell = useWorkspaceStore((s) => s.defaultShell);

  useEffect(() => {
    void rpc.request
      .loadWorkspace({})
      .catch(() => null)
      .then((snapshot) => hydrate(snapshot));
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !projects.length) return;
    void rpc.request
      .saveWorkspace({
        workspace: {
          projects,
          activeProjectId,
          activeSessionId,
          panes,
          defaultShell,
          termFontSize,
          termLineHeight,
          termCursorBlink,
        },
      })
      .catch(() => undefined);
  }, [
    hydrated,
    projects,
    activeProjectId,
    activeSessionId,
    panes,
    defaultShell,
    termFontSize,
    termLineHeight,
    termCursorBlink,
  ]);

  useEffect(() => {
    if (activeSession) document.title = `${activeSession.title} — ${project?.name ?? "Terminal"}`;
  }, [activeSession, project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (event.ctrlKey && event.key === "Tab" && sessions.length > 1) {
        event.preventDefault();
        const idx = sessions.findIndex((s) => s.id === activeSessionId);
        const step = event.shiftKey ? -1 : 1;
        const next = (idx + step + sessions.length) % sessions.length;
        selectSession(sessions[next].id);
        return;
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
        setEditingGroup({ id: null, name: "", color: "#60a5fa" });
      }
      if (mod && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        const target = projects[Number(event.key) - 1];
        if (target) selectProject(target.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSessionId, addSession, projects, sessions, split, selectSession, selectProject]);

  useEffect(() => {
    let disposed = false;
    const refresh = () =>
      void rpc.request
        .listAgents({})
        .then((items) => {
          if (!disposed) setAgents(items);
        })
        .catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void rpc.request
      .listShells({})
      .then(setShells)
      .catch(() => setShells([]));
  }, [setShells]);

  if (!hydrated) return <div className="h-screen bg-background" />;

  const paneSessions = panes.map((pane) => {
    const s = sessions.find((sess) => sess.id === pane.sessionId) ?? activeSession;
    return { ...pane, session: s };
  });
  const allSessions = projects.flatMap((item) => item.sessions);
  const paneCount = paneSessions.length;
  const splitColumn = panes[0]?.direction === "column";

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-9 shrink-0 items-center border-b border-sidebar-border px-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Groups
          </span>
          <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-zinc-400">
            {projects.length}
          </span>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto scrollbar-none">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            return (
              <div
                key={p.id}
                onClick={() => selectProject(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") selectProject(p.id);
                }}
                role="button"
                tabIndex={0}
                className={`group flex w-full flex-col items-start gap-0.5 border-b border-white/5 px-3 py-2 text-left text-sm cursor-pointer transition-none ${
                  isActive
                    ? "bg-white/[0.08] text-zinc-100"
                    : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="truncate text-[12.5px] font-[550] flex gap-1.5 items-center tracking-tight">
                    <Folder className="w-3.5 shrink-0" style={{ color: p.color || "#71717a" }} />
                    {p.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit group ${p.name}`}
                    title="Edit group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingGroup({ id: p.id, name: p.name, color: p.color || "#60a5fa" });
                    }}
                    className="ml-auto flex size-5 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete group ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProject(p.id);
                    }}
                    title="Delete group"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-[5px] transition-colors ${isActive ? "text-zinc-500 hover:bg-white/10 hover:text-zinc-200" : "text-zinc-600 opacity-0 hover:bg-white/10 hover:text-zinc-200 group-hover:opacity-100"}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <span
                  className={`truncate font-mono text-[11px] w-full pl-[20px] leading-none ${isActive ? "text-zinc-500" : "text-zinc-600 group-hover:text-zinc-500"}`}
                >
                  {p.sessions.length} {p.sessions.length === 1 ? "session" : "sessions"}
                </span>
              </div>
            );
          })}
          <button
            type="button"
            aria-label="New group"
            onClick={() => setEditingGroup({ id: null, name: "", color: "#60a5fa" })}
            className="flex w-full items-center gap-2 border-b border-white/10 bg-transparent px-2.5 py-2 font-mono text-xs font-medium text-zinc-500 hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-200 transition-colors"
          >
            <Plus size={13} strokeWidth={2.2} />
            <span>New group</span>
            <span className="ml-auto font-mono text-[10px] text-zinc-600">⌘N</span>
          </button>
        </div>
        <div className="shrink-0 border-t border-sidebar-border">
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-zinc-400">
            <span>Agents</span>
            <span className="text-zinc-600">{agents.length}</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {agents.length === 0 && (
              <p className="px-3 pb-3 text-xs text-zinc-600">No running agents</p>
            )}
            {agents.map((agent) => {
              const group = projects.find((p) => p.sessions.some((s) => s.id === agent.sessionId));
              const session = group?.sessions.find((s) => s.id === agent.sessionId);
              if (!group || !session) return null;
              return (
                <button
                  key={`${agent.sessionId}-${agent.name}`}
                  type="button"
                  onClick={() => {
                    selectProject(group.id);
                    selectSession(agent.sessionId);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue-400"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs capitalize text-zinc-200">
                      {agent.name}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">
                      {group.name} / {session.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      {editingGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setEditingGroup(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingGroup.name.trim()) return;
              saveGroup(editingGroup.id, editingGroup.name, editingGroup.color);
              setEditingGroup(null);
            }}
            className="w-80 rounded-lg border border-white/15 bg-[#1b1b1e] p-4 shadow-2xl"
          >
            <h2 className="text-sm font-semibold">
              {editingGroup.id ? "Edit group" : "New group"}
            </h2>
            <label className="mt-4 block text-xs text-zinc-400">
              Name
              <input
                autoFocus
                required
                maxLength={80}
                value={editingGroup.name}
                onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                className="mt-1.5 w-full rounded border border-white/15 bg-black/30 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400"
                placeholder="e.g. Backend"
              />
            </label>
            <label className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
              Color
              <input
                type="color"
                value={editingGroup.color}
                onChange={(e) => setEditingGroup({ ...editingGroup, color: e.target.value })}
                className="h-7 w-10 cursor-pointer bg-transparent"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10"
              >
                Cancel
              </button>
              <button className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-400">
                Save group
              </button>
            </div>
          </form>
        </div>
      )}
      <main className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <SessionTabs
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={selectSession}
          onClose={closeSession}
          onNew={addSession}
          shells={shells}
          panel={panel}
          onPanelToggle={setPanel}
          onSettings={() => setSettingsOpen(true)}
        />
        {projects.length > 1 && (
          <div className="flex h-7 items-center justify-end border-b border-white/5 px-3 text-xs text-zinc-500">
            <label>
              Move current session to{" "}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) moveSession(e.target.value);
                }}
                className="ml-2 bg-transparent text-zinc-400 outline-none"
              >
                <option value="">Select group?</option>
                {projects
                  .filter((p) => p.id !== activeProjectId)
                  .map((p) => (
                    <option className="bg-zinc-900" key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        <div className="relative isolate min-h-0 flex-1 overflow-hidden bg-[#0e0e0e]">
          {allSessions.map((session) => {
            const paneIndex = paneSessions.findIndex((pane) => pane.session?.id === session.id);
            const visible = paneIndex >= 0 && paneCount > 0;
            const size = `${100 / paneCount}%`;
            const isLast = paneIndex === paneCount - 1;
            return (
              <div
                key={session.id}
                aria-hidden={visible ? undefined : true}
                className="absolute overflow-hidden"
                style={{
                  visibility: visible ? "visible" : "hidden",
                  pointerEvents: visible ? "auto" : "none",
                  zIndex: visible ? 1 : 0,
                  top: visible ? (splitColumn ? `${paneIndex * (100 / paneCount)}%` : 0) : 0,
                  left: visible ? (splitColumn ? 0 : `${paneIndex * (100 / paneCount)}%`) : 0,
                  height: visible ? (splitColumn ? size : "100%") : "100%",
                  width: visible ? (splitColumn ? "100%" : size) : "100%",
                  borderRight:
                    visible && !isLast && !splitColumn ? "1px solid oklch(1 0 0 / 10%)" : undefined,
                  borderBottom:
                    visible && !isLast && splitColumn ? "1px solid oklch(1 0 0 / 10%)" : undefined,
                }}
              >
                <SessionView
                  session={session}
                  onTitle={updateTitle}
                  active={session.id === activeSessionId}
                  visible={visible}
                  fontSize={termFontSize}
                  lineHeight={termLineHeight}
                  cursorBlink={termCursorBlink}
                />
              </div>
            );
          })}
        </div>
      </main>
      {panel && (
        <Suspense
          fallback={
            <div className="w-[min(24rem,40vw)] shrink-0 border-l border-white/10 bg-[#0f0f0f]" />
          }
        >
          <WorkspacePanel project={project} panel={panel} onPanelToggle={setPanel} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <NewSessionDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          shells={shells}
          initialPath={project?.path ?? "."}
          onCreate={createProject}
        />
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          fontSize={termFontSize}
          onFontSizeChange={setTermFontSize}
          lineHeight={termLineHeight}
          onLineHeightChange={setTermLineHeight}
          cursorBlink={termCursorBlink}
          onCursorBlinkChange={setTermCursorBlink}
        />
      </Suspense>
    </div>
  );
}

function WorkspacePanel({
  project,
  panel,
  onPanelToggle,
}: {
  project?: { path: string };
  panel: "files" | "git";
  onPanelToggle: (panel: "files" | "git" | null) => void;
}) {
  return (
    <aside className="flex w-[min(24rem,40vw)] shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#0f0f0f] text-sm text-foreground">
      <div className="flex h-9 shrink-0 items-center border-b border-white/10 bg-[#0f0f0f] px-2">
        <div className="flex h-full items-center">
          {(["files", "git"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={panel === item}
              onClick={() => onPanelToggle(item)}
              className={`h-full border-r border-white/10 px-3 text-[11px] font-[650] capitalize tracking-tight transition-none ${panel === item ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500 hover:text-zinc-200"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close workspace panel"
          title="Close panel"
          onClick={() => onPanelToggle(null)}
          className="ml-auto flex size-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-[#0f0f0f]">
        <Suspense
          fallback={
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <span className="size-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
              Loading…
            </div>
          }
        >
          {panel === "files" &&
            (project ? (
              <FilesPanel cwd={project.path} />
            ) : (
              <p className="p-4 text-muted-foreground">No project selected.</p>
            ))}
          {panel === "git" && <GitPanel cwd={project?.path} />}
        </Suspense>
      </div>
    </aside>
  );
}
