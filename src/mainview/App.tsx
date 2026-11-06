import { lazy, Suspense, useEffect } from "react";
import { Plus, Trash2, Folder, X } from "lucide-react";
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
        useWorkspaceStore.getState().addProject();
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
            Workspaces
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
                    <Folder
                      className={`w-3.5 shrink-0 ${isActive ? "text-zinc-400" : "text-zinc-600 group-hover:text-zinc-400"}`}
                    />
                    {p.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete workspace ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProject(p.id);
                    }}
                    title="Delete workspace"
                    className={`ml-auto flex size-5 shrink-0 items-center justify-center rounded-[5px] transition-colors ${isActive ? "text-zinc-500 hover:bg-white/10 hover:text-zinc-200" : "text-zinc-600 opacity-0 hover:bg-white/10 hover:text-zinc-200 group-hover:opacity-100"}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <span
                  className={`truncate font-mono text-[11px] w-full pl-[20px] leading-none ${isActive ? "text-zinc-500" : "text-zinc-600 group-hover:text-zinc-500"}`}
                >
                  {p.path}
                </span>
              </div>
            );
          })}
          <button
            type="button"
            aria-label="New project"
            onClick={() => useWorkspaceStore.getState().addProject()}
            className="flex w-full items-center gap-2 border-b border-white/10 bg-transparent px-2.5 py-2 font-mono text-xs font-medium text-zinc-500 hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-200 transition-colors"
          >
            <Plus size={13} strokeWidth={2.2} />
            <span>New project</span>
            <span className="ml-auto font-mono text-[10px] text-zinc-600">⌘N</span>
          </button>
        </div>
      </aside>
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
