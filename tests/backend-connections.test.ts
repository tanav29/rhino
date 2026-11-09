import { afterEach, expect, test } from "bun:test";
import type { RpcClient, WorkspaceSnapshot } from "../src/shared/rpc-schema";
import type { SessionEvent } from "../src/bun/sessions";
import { startBackendServer } from "../src/bun/backend-server";
import { createBackendConnections } from "../src/mainview/backend-connections";

const servers: { stop(): void }[] = [];
const managers: ReturnType<typeof createBackendConnections>[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.close();
  for (const server of servers.splice(0)) server.stop();
});
const workspace = (name: string): WorkspaceSnapshot => ({
  projects: [{ id: name }],
  activeProjectId: name,
  activeSessionId: name,
  panes: [],
});
function start(name: string, accessToken?: string) {
  let snapshot = workspace(name);
  const server = startBackendServer({
    port: 0,
    hostname: "127.0.0.1",
    pin: "012345",
    accessToken,
    staticDirectory: ".",
    handlers: {
      loadWorkspace: () => snapshot,
      saveWorkspace: ({ workspace }) => {
        snapshot = workspace;
        return null;
      },
    },
  });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}
function create(local: RpcClient | null = { request: {}, send: {} } as RpcClient) {
  const saved = new Map<string, string>();
  const events: SessionEvent[] = [];
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: (key: string) => {
      saved.delete(key);
    },
  };
  const manager = createBackendConnections({
    local,
    initialUrl: "http://localhost",
    storage,
    onEvent: (event) => events.push(event),
  });
  managers.push(manager);
  return { manager, saved, storage, events, local };
}
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(10);
  expect(predicate()).toBe(true);
}

test("switches local and multiple authenticated backends without closing sockets or crossing workspace writes", async () => {
  const a = start("a"),
    b = start("b");
  const { manager, local } = create();
  await manager.connect(a, "012345", "Laptop");
  const clientA = manager.getClient();
  await manager.connect(b, "012345", "Server");
  const clientB = manager.getClient();
  expect((await clientB.request.loadWorkspace({}))?.activeProjectId).toBe("b");
  manager.switchToLocal();
  expect(manager.getClient()).toBe(local!);
  expect(manager.switchToRemote(a)).toBe(true);
  expect(manager.getClient()).toBe(clientA);
  await clientA.request.saveWorkspace({ workspace: workspace("a-edited") });
  expect((await clientB.request.loadWorkspace({}))?.activeProjectId).toBe("b");
  expect(manager.switchToRemote(b)).toBe(true);
  expect(manager.getClient()).toBe(clientB);
  expect((await clientA.request.loadWorkspace({}))?.activeProjectId).toBe("a-edited");
  expect(manager.getSnapshot().machines.map((m) => m.status)).toEqual(["connected", "connected"]);
});

test("failed additions preserve the active terminal; background disconnects preserve local selection", async () => {
  const a = start("a"),
    b = start("b");
  const { manager, local } = create();
  await manager.connect(a, "012345");
  const active = manager.getClient();
  await expect(manager.connect(b, "999999")).rejects.toThrow("Incorrect PIN");
  expect(manager.getClient()).toBe(active);
  manager.switchToLocal();
  servers[0].stop();
  await waitFor(() => manager.getSnapshot().machines[0].status === "disconnected");
  expect(manager.getClient()).toBe(local!);
  expect(manager.getSnapshot().status).toBe("connected");
});

test("saved machines contain names and URLs, never PINs or share tokens", async () => {
  const token = "z".repeat(43);
  const url = start("public", token);
  const { manager, saved, storage, local } = create();
  await manager.connect(`${url}#token=${token}`, "012345", "Remote laptop");
  const serialized = saved.get("rhino.machines:v1")!;
  expect(serialized).not.toContain(token);
  expect(serialized).not.toContain("012345");
  const restored = createBackendConnections({ local, storage, initialUrl: "", onEvent() {} });
  managers.push(restored);
  expect(restored.getSnapshot().machines).toEqual([
    { url, name: "Remote laptop", status: "disconnected" },
  ]);
  expect(restored.getClient()).toBe(local!);
  expect(restored.switchToRemote(url)).toBe(false);
  manager.forget(url);
  expect(manager.getSnapshot().machines).toHaveLength(0);
  expect(manager.getClient()).toBe(local!);
  expect(saved.get("rhino.machines:v1")).toBe("[]");
});

test("an active backend disconnect presents reconnect state and permits switching to another live backend", async () => {
  const a = start("a"),
    b = start("b");
  const { manager } = create(null);
  await manager.connect(a, "012345");
  await manager.connect(b, "012345");
  servers[1].stop();
  await waitFor(() => manager.getSnapshot().status === "disconnected");
  expect(() => manager.getClient()).toThrow("Backend disconnected");
  expect(manager.switchToRemote(a)).toBe(true);
  expect((await manager.getClient().request.loadWorkspace({}))?.activeProjectId).toBe("a");
});

test("choosing the local machine while a connection is pending prevents a late selection change", async () => {
  const { manager, local } = create();
  const url = start("a");
  const pending = manager.connect(url, "012345");
  manager.switchToLocal();
  await pending;
  expect(manager.getClient()).toBe(local!);
  expect(manager.getSnapshot().url).toBe("");
  expect(manager.switchToRemote(url)).toBe(true);
});

test("PTY events from background machines cannot reach the selected machine's terminal", async () => {
  function eventBackend() {
    const sockets = new Set<Bun.ServerWebSocket<undefined>>();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request, server) {
        if (server.upgrade(request)) return;
        return new Response(null, { status: 426 });
      },
      websocket: {
        open(socket) {
          sockets.add(socket);
        },
        close(socket) {
          sockets.delete(socket);
        },
        message(socket, data) {
          const { id } = JSON.parse(String(data));
          socket.send(JSON.stringify({ id, result: null }));
        },
      },
    });
    servers.push({ stop: () => server.stop(true) });
    return {
      url: `http://127.0.0.1:${server.port}`,
      emit(data: string) {
        for (const socket of sockets)
          socket.send(JSON.stringify({ event: { kind: "output", sessionId: "same-id", data } }));
      },
    };
  }
  const a = eventBackend(),
    b = eventBackend();
  const { manager, events } = create();
  await manager.connect(a.url, "012345");
  await manager.connect(b.url, "012345");
  a.emit("a-hidden");
  b.emit("b-visible");
  await waitFor(() => events.length > 0);
  expect(events).toEqual([{ kind: "output", sessionId: "same-id", data: "b-visible" }]);
  manager.switchToRemote(a.url);
  b.emit("b-hidden");
  a.emit("a-visible");
  await waitFor(() => events.length > 1);
  expect(events[1]).toEqual({ kind: "output", sessionId: "same-id", data: "a-visible" });
  manager.switchToLocal();
  a.emit("a-hidden-local");
  b.emit("b-hidden-local");
  await Bun.sleep(30);
  expect(events).toHaveLength(2);
});
