import { beforeEach, expect, mock, test } from "bun:test";

const kill = mock(() => {});
mock.module("../src/mainview/rpc", () => ({ rpc: { send: { killSession: kill } } }));
const { useWorkspaceStore } = await import("../src/mainview/store");

beforeEach(() => {
  useWorkspaceStore.getState().hydrate(null);
  kill.mockClear();
});

test("invalid and empty saved workspaces recover to a usable terminal", () => {
  for (const snapshot of [{ projects: [] }, { projects: [{ id: "broken", sessions: [] }] }]) {
    useWorkspaceStore.getState().hydrate(snapshot);
    const state = useWorkspaceStore.getState();
    expect(state.projects[0].sessions).toHaveLength(1);
    expect(state.panes[0].sessionId).toBe(state.activeSessionId);
  }
});

test("selecting a visible split focuses it without duplicating panes", () => {
  useWorkspaceStore.getState().split("row");
  const split = useWorkspaceStore.getState();
  split.selectSession(split.panes[1].sessionId);
  expect(new Set(useWorkspaceStore.getState().panes.map((pane) => pane.sessionId)).size).toBe(2);
  useWorkspaceStore.getState().closeSession(split.activeSessionId);
  const closed = useWorkspaceStore.getState();
  expect(closed.panes).toHaveLength(1);
  expect(closed.activeSessionId).toBe(closed.panes[0].sessionId);
});

test("closing the last terminal creates a working replacement", () => {
  const id = useWorkspaceStore.getState().activeSessionId;
  useWorkspaceStore.getState().closeSession(id);
  const state = useWorkspaceStore.getState();
  expect(kill).toHaveBeenCalledWith({ sessionId: id });
  expect(state.activeSessionId).not.toBe(id);
  expect(state.projects[0].sessions).toHaveLength(1);
  expect(state.panes[0].sessionId).toBe(state.activeSessionId);
});

test("new tabs, splits and replacement terminals do not inherit a project directory", () => {
  for (const action of ["tab", "split", "replace"] as const) {
    const store = useWorkspaceStore.getState();
    store.hydrate(null);
    store.setDefaultDirectory("/saved/default");
    store.createProject("test-shell", "/previous/project");
    const active = useWorkspaceStore.getState();
    if (action === "tab") active.addSession();
    else if (action === "split") active.split("row");
    else active.closeSession(active.activeSessionId);
    const state = useWorkspaceStore.getState();
    const session = state.projects
      .find((project) => project.id === state.activeProjectId)!
      .sessions.find((session) => session.id === state.activeSessionId)!;
    expect(session.cwd).toBeUndefined();
    expect(session.sourceSessionId).toBeUndefined();
  }
});

test("restoring a workspace discards saved terminal directories and inheritance", () => {
  const store = useWorkspaceStore.getState();
  store.createProject("test-shell", "/saved/project");
  const snapshot = JSON.parse(JSON.stringify(useWorkspaceStore.getState()));
  const project = snapshot.projects.find(
    (project: { id: string }) => project.id === snapshot.activeProjectId,
  );
  project.sessions[0].sourceSessionId = "previous-terminal";
  store.hydrate(snapshot);
  const restored = useWorkspaceStore.getState().projects.find((p) => p.id === project.id)!;
  expect(restored.path).toBe("/saved/project");
  expect(restored.sessions[0].shell).toBe("test-shell");
  expect(restored.sessions[0].cwd).toBeUndefined();
  expect(restored.sessions[0].sourceSessionId).toBeUndefined();
});

test("sidebar visibility restores from saved workspaces and defaults open for older snapshots", () => {
  const store = useWorkspaceStore.getState();
  store.setSidebarCollapsed(true);
  const snapshot = JSON.parse(JSON.stringify(useWorkspaceStore.getState()));
  store.hydrate(null);
  expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(false);
  store.hydrate(snapshot);
  expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(true);
  for (const value of [false, undefined, "true"]) {
    store.hydrate({ ...snapshot, sidebarCollapsed: value });
    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(false);
  }
});
