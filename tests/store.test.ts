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
