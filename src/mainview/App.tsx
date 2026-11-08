import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Folder, X, Pencil } from "lucide-react";
import { SessionTabs } from "./session-tabs";
import { AgentIcon } from "./agent-icon";
import { SessionView } from "./session-view";
import { rpc } from "./rpc";
import { useWorkspaceStore, selectActiveSession } from "./store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const sidebarRef = useRef<HTMLElement>(null);
  const resizeRef = useRef<{ x: number; width: number } | null>(null);
  const [agents, setAgents] = useState<{ sessionId: string; name: string }[]>([]);
  const [editingGroup, setEditingGroup] = useState<{
    id: string | null;
    name: string;
    color: string;
  } | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const saveGroup = useWorkspaceStore((s) => s.saveGroup);
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
  const focusSession = useWorkspaceStore((s) => s.focusSession);
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
  const panelCwd = activeSession?.cwd || project?.path;

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
    if (activeSession) document.title = `${activeSession.title} — ${project?.name ?? "Rhino"}`;
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
        setEditingGroup({ id: null, name: "", color: "#58a6ff" });
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
      <aside
        aria-label="Workspaces"
        ref={sidebarRef}
        className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={140}
          aria-valuemax={480}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize touch-none focus-visible:bg-sidebar-ring/30"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            resizeRef.current = { x: event.clientX, width: sidebarWidth };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (resizeRef.current && sidebarRef.current) {
              const width = resizeRef.current.width + event.clientX - resizeRef.current.x;
              sidebarRef.current.style.width = `${Math.max(140, Math.min(480, width))}px`;
            }
          }}
          onLostPointerCapture={() => {
            if (resizeRef.current && sidebarRef.current) {
              setSidebarWidth(sidebarRef.current.offsetWidth);
            }
            resizeRef.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setSidebarWidth((width) =>
              Math.max(140, Math.min(480, width + (event.key === "ArrowRight" ? 10 : -10))),
            );
          }}
        />
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
          <h1 className="text-sm font-semibold tracking-tight">Rhino</h1>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 scrollbar-none">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            return (
              <div
                key={p.id}
                className={`group flex w-full items-start rounded-md border px-2 py-2 text-sm transition-colors ${
                  isActive
                    ? "border-border bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectProject(p.id)}
                  aria-pressed={isActive}
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded px-1 text-left"
                >
                  <span className="truncate text-[12.5px] font-[550] flex gap-1.5 items-center tracking-tight">
                    <Folder className="w-3 shrink-0" style={{ color: p.color || "#9198a1" }} />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="w-full truncate pl-4.5 -mt-2 text-[11px] leading-4 text-muted-foreground">
                    {p.sessions.length} {p.sessions.length === 1 ? "session" : "sessions"}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Edit group ${p.name}`}
                  title="Edit group"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingGroup({ id: p.id, name: p.name, color: p.color || "#58a6ff" });
                  }}
                  className="ml-auto flex size-6 shrink-0 items-center justify-center rounded hover:bg-secondary hover:text-foreground text-muted-foreground"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete group ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingGroup(p.id);
                  }}
                  title="Delete group"
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            aria-label="New group"
            onClick={() => setEditingGroup({ id: null, name: "", color: "#58a6ff" })}
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus size={13} strokeWidth={2.2} />
            <span>New group</span>
            <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+N</span>
          </button>
        </div>
        <div className="flex max-h-[min(12rem,40%)] shrink-0 flex-col border-t border-sidebar-border">
          <div className="min-h-0 overflow-y-auto">
            {agents.length === 0 && (
              <p className="px-4 py-3 text-xs text-muted-foreground">No running agents</p>
            )}
            {agents.map((agent) => {
              const group = projects.find((p) => p.sessions.some((s) => s.id === agent.sessionId));
              const session = group?.sessions.find((s) => s.id === agent.sessionId);
              if (!group || !session) return null;
              return (
                <button
                  key={`${agent.sessionId}-${agent.name}`}
                  type="button"
                  title={agent.name}
                  aria-label={`${agent.name}: ${session.title}`}
                  onClick={() => {
                    selectProject(group.id);
                    selectSession(agent.sessionId);
                  }}
                  className="flex min-h-9 w-full items-center gap-2 px-4 py-2 text-left hover:bg-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <AgentIcon name={agent.name} />
                    <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                      {/*{group.name} /*/}
                      {session.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      {deletingGroup &&
        (() => {
          const group = projects.find((p) => p.id === deletingGroup);
          if (!group) return null;
          return (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setDeletingGroup(null);
              }}
            >
              <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
                <div className="p-5">
                  <DialogTitle>Delete group?</DialogTitle>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Delete "{group.name}"? This closes {group.sessions.length} terminal
                    {group.sessions.length === 1 ? "" : "s"}.
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDeletingGroup(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        removeProject(group.id);
                        setDeletingGroup(null);
                      }}
                    >
                      Delete group
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}
      {editingGroup && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingGroup(null);
          }}
        >
          <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingGroup.name.trim()) return;
                saveGroup(editingGroup.id, editingGroup.name, editingGroup.color);
                setEditingGroup(null);
              }}
              className="p-5"
            >
              <DialogTitle>{editingGroup.id ? "Edit group" : "New group"}</DialogTitle>
              <label className="mt-4 block text-xs text-muted-foreground">
                Name
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={editingGroup.name}
                  onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  className="mt-1.5 w-full rounded border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-ring"
                  placeholder="e.g. Backend"
                />
              </label>
              <label className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                Color
                <input
                  type="color"
                  value={editingGroup.color}
                  onChange={(e) => setEditingGroup({ ...editingGroup, color: e.target.value })}
                  className="h-7 w-10 cursor-pointer bg-transparent"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingGroup(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!editingGroup.name.trim()}>
                  Save group
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <main className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <SessionTabs
          sessions={sessions}
          agents={agents}
          activeId={activeSessionId}
          onSelect={selectSession}
          onClose={closeSession}
          onNew={addSession}
          shells={shells}
          panel={panel}
          onPanelToggle={setPanel}
          onSettings={() => setSettingsOpen(true)}
        />
        <div className="relative isolate min-h-0 flex-1 overflow-hidden bg-background">
          {allSessions.map((session) => {
            const paneIndex = paneSessions.findIndex((pane) => pane.session?.id === session.id);
            const visible = paneIndex >= 0 && paneCount > 0;
            const size = `${100 / paneCount}%`;
            const isLast = paneIndex === paneCount - 1;
            return (
              <div
                key={session.id}
                aria-hidden={visible ? undefined : true}
                onPointerDown={() => focusSession(session.id)}
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
                    visible && !isLast && !splitColumn ? "1px solid var(--border)" : undefined,
                  borderBottom:
                    visible && !isLast && splitColumn ? "1px solid var(--border)" : undefined,
                }}
              >
                <SessionView
                  session={session}
                  onTitle={updateTitle}
                  active={
                    session.id === activeSessionId && !newOpen && !settingsOpen && !editingGroup
                  }
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
            <div className="w-[min(24rem,40vw)] shrink-0 border-l border-border bg-sidebar" />
          }
        >
          <WorkspacePanel cwd={panelCwd} panel={panel} onPanelToggle={setPanel} />
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
  cwd,
  panel,
  onPanelToggle,
}: {
  cwd?: string;
  panel: "files" | "git";
  onPanelToggle: (panel: "files" | "git" | null) => void;
}) {
  return (
    <aside
      aria-label="Workspace panel"
      className="flex w-[min(24rem,40vw)] shrink-0 flex-col overflow-hidden border-l border-border bg-sidebar text-sm text-foreground"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-sidebar px-2">
        <div className="flex h-full items-center">
          {(["files", "git"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={panel === item}
              onClick={() => onPanelToggle(item)}
              className={`h-full border-b-2 px-3 text-xs font-medium capitalize transition-colors ${panel === item ? "border-ring text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
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
          className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-sidebar">
        <Suspense
          fallback={
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <span className="size-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
              Loading…
            </div>
          }
        >
          {panel === "files" &&
            (cwd ? (
              <FilesPanel cwd={cwd} />
            ) : (
              <p className="p-4 text-muted-foreground">No project selected.</p>
            ))}
          {panel === "git" && <GitPanel cwd={cwd} />}
        </Suspense>
      </div>
    </aside>
  );
}
