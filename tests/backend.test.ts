import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackendHandlers } from "../src/bun/backend-handlers";
import { createBackendController } from "../src/bun/backend-controller";
import { generatePin, startBackendServer } from "../src/bun/backend-server";
import { attachSession, killAllSessions, type SessionEvent } from "../src/bun/sessions";
import { connectBackendSocket, normalizeBackendUrl } from "../src/mainview/backend-client";

const directory = mkdtempSync(join(tmpdir(), "term-backend-test-"));
const publicDirectory = join(directory, "public");
mkdirSync(publicDirectory);
writeFileSync(join(publicDirectory, "index.html"), "<h1>Terminal login</h1>");
writeFileSync(join(directory, "private.txt"), "PRIVATE_FILE");
const servers: { stop(): void }[] = [];
const clients: { close(): void }[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  for (const server of servers.splice(0)) server.stop();
  killAllSessions();
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function start(handlers = createBackendHandlers()) {
  const server = startBackendServer({
    port: 0,
    hostname: "127.0.0.1",
    pin: "012345",
    staticDirectory: publicDirectory,
    handlers,
  });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}
async function connect(url: string, onEvent: (event: SessionEvent) => void = () => {}) {
  const client = await connectBackendSocket({ url, pin: "012345", onEvent, onClose: () => {} });
  clients.push(client);
  return client.client;
}
async function rawSocket(url: string) {
  const socket = new WebSocket(url.replace("http:", "ws:") + "/ws");
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Connection failed")), { once: true });
  });
  return socket;
}
function receive(socket: WebSocket) {
  return new Promise<{ id?: number; result?: unknown; error?: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Response timed out")), 2000);
    socket.addEventListener(
      "message",
      ({ data }) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(data)));
      },
      { once: true },
    );
  });
}
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(20);
  expect(predicate()).toBe(true);
}

test("requires PIN authentication before any RPC and never sends PTY output to unauthenticated clients", async () => {
  const url = start();
  const socket = await rawSocket(url);
  const messages: unknown[] = [];
  socket.addEventListener("message", ({ data }) => messages.push(JSON.parse(String(data))));
  const events: SessionEvent[] = [];
  const client = await connect(url, (event) => events.push(event));
  await client.request.attachSession({ sessionId: "network-private", cols: 80, rows: 24 });
  client.send.ptyInput({ sessionId: "network-private", data: "echo PRIVATE_OUTPUT\r" });
  await waitFor(() =>
    events.some((event) => event.kind === "output" && event.data.includes("PRIVATE_OUTPUT")),
  );
  expect(messages).toHaveLength(0);
  const response = receive(socket);
  socket.send(JSON.stringify({ id: 1, method: "listShells", params: {} }));
  expect((await response).error).toBe("PIN required");
});

test("wrong PINs are rejected and reconnecting cannot bypass the attempt limit", async () => {
  const url = start();
  for (let i = 0; i < 5; i++) {
    await expect(
      connectBackendSocket({ url, pin: "999999", onEvent() {}, onClose() {} }),
    ).rejects.toThrow("Incorrect PIN");
  }
  await expect(connect(url)).rejects.toThrow("Too many PIN attempts");
});

test("authenticated client controls a real PTY, reattaches with scrollback, and can kill it", async () => {
  const url = start();
  const events: SessionEvent[] = [];
  const client = await connect(url, (event) => events.push(event));
  expect((await client.request.listShells({})).length).toBeGreaterThan(0);
  const params = { sessionId: "network-pty", cols: 80, rows: 24, cwd: process.cwd() };
  // A terminal started locally is the same terminal controlled over the network.
  attachSession(params);
  await client.request.attachSession(params);
  client.send.ptyResize({ sessionId: params.sessionId, cols: 100, rows: 30 });
  const marker = process.platform === "win32" ? "NETWORK_Windows_NT" : "NETWORK_OK";
  client.send.ptyInput({
    sessionId: params.sessionId,
    data: process.platform === "win32" ? "echo NETWORK_%OS%\r" : "printf 'NETWORK_%s\\n' OK\n",
  });
  await waitFor(() =>
    events.some((event) => event.kind === "output" && event.data.includes(marker)),
  );
  const second = await connect(url);
  expect((await second.request.attachSession(params)).replay).toContain(marker);
  client.send.killSession({ sessionId: params.sessionId });
  await waitFor(() =>
    events.some((event) => event.kind === "exit" && event.sessionId === params.sessionId),
  );
});

test("network clients cannot manage sharing or send malformed PTY requests", async () => {
  const client = await connect(start());
  await expect(client.request.getBackendStatus({})).rejects.toThrow("Invalid request");
  await expect(
    client.request.openTerminalLink({ sessionId: "local", target: "https://example.com" }),
  ).rejects.toThrow("Invalid request");
  await expect(client.request.configureBackend({ shared: true, port: 1234 })).rejects.toThrow(
    "Invalid request",
  );
  await expect(
    client.request.attachSession({ sessionId: "invalid", cols: 0, rows: 24 }),
  ).rejects.toThrow("Invalid request");
  // Rejected requests do not break the authenticated connection.
  expect((await client.request.listShells({})).length).toBeGreaterThan(0);
});

test("serves the login app but cannot serve files outside the webview directory", async () => {
  const url = start();
  expect(await (await fetch(url)).text()).toContain("Terminal login");
  const response = await fetch(`${url}/%2e%2e%5cprivate.txt`);
  expect(response.status).toBeOneOf([403, 404]);
  expect(await response.text()).not.toContain("PRIVATE_FILE");
  expect((await fetch(`${url}/ws`)).status).toBe(426);
});

test("disconnect rejects outstanding requests instead of leaving them hanging", async () => {
  let release!: () => void;
  const blocked = new Promise<null>((resolve) => {
    release = () => resolve(null);
  });
  const url = start({ ...createBackendHandlers(), loadWorkspace: () => blocked });
  const client = await connect(url);
  const pending = client.request.loadWorkspace({});
  servers[0].stop();
  servers.length = 0;
  await expect(pending).rejects.toThrow("Backend disconnected");
  release();
});

test("sharing and PIN changes disconnect existing clients, and a failed port change restores the server", async () => {
  const controller = createBackendController(createBackendHandlers(), publicDirectory);
  servers.push(controller);
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port!;
  probe.stop(true);
  const initial = controller.configure({ shared: true, port });
  expect(initial.running).toBe(true);
  expect(initial.shared).toBe(true);
  const url = `http://127.0.0.1:${port}`;
  let disconnected = false;
  const connected = await connectBackendSocket({
    url,
    pin: initial.pin,
    onEvent() {},
    onClose() {
      disconnected = true;
    },
  });
  clients.push(connected);
  const next = controller.configure({ shared: false, port, regeneratePin: true });
  expect(next.shared).toBe(false);
  expect(next.pin).not.toBe(initial.pin);
  await waitFor(() => disconnected);
  await expect(
    connectBackendSocket({ url, pin: initial.pin, onEvent() {}, onClose() {} }),
  ).rejects.toThrow("Incorrect PIN");
  const busy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  try {
    expect(() => controller.configure({ shared: true, port: busy.port! })).toThrow(
      "Unable to start backend",
    );
    expect(controller.status().port).toBe(port);
    const restored = await connectBackendSocket({ url, pin: next.pin, onEvent() {}, onClose() {} });
    clients.push(restored);
    expect((await restored.client.request.listShells({})).length).toBeGreaterThan(0);
  } finally {
    busy.stop(true);
  }
});

test("backend URLs accept HTTP and WebSocket URLs without embedding credentials", () => {
  expect(normalizeBackendUrl(" http://192.168.1.10:43188/ ")).toBe("http://192.168.1.10:43188");
  expect(normalizeBackendUrl("wss://terminal.example/ws")).toBe("https://terminal.example");
  for (const value of [
    "file:///tmp",
    "http://user:pin@host",
    "http://host?pin=123456",
    "invalid",
  ]) {
    expect(() => normalizeBackendUrl(value)).toThrow();
  }
  expect(generatePin()).toMatch(/^\d{6}$/);
});
