import { DEV_BACKEND_PORT, DEV_FRONTEND_PORT } from "../shared/ports";
import { createApiHandlers } from "./api";
import {
  attachSession,
  listAgents,
  killAllSessions,
  killSession,
  resizePty,
  setSessionEventSink,
  writePtyInput,
} from "./sessions";

const handlers = { ...createApiHandlers(), attachSession, listAgents };
const sockets = new Set<import("bun").ServerWebSocket<unknown>>();
setSessionEventSink((event) => {
  for (const socket of sockets) socket.send(JSON.stringify({ event }));
});
process.on("exit", killAllSessions);
Bun.serve({
  hostname: "127.0.0.1",
  port: DEV_BACKEND_PORT,
  fetch(req, server) {
    const origin = req.headers.get("origin");
    if (
      origin !== `http://localhost:${DEV_FRONTEND_PORT}` &&
      origin !== `http://127.0.0.1:${DEV_FRONTEND_PORT}`
    )
      return new Response("Forbidden", { status: 403 });
    if (server.upgrade(req)) return;
    return new Response("WebSocket required", { status: 426 });
  },
  websocket: {
    open(socket) {
      sockets.add(socket);
    },
    close(socket) {
      sockets.delete(socket);
    },
    async message(socket, message) {
      try {
        const { id, method, params } = JSON.parse(String(message));
        if (method === "ptyInput") return writePtyInput(params.sessionId, params.data);
        if (method === "ptyResize") return resizePty(params.sessionId, params.cols, params.rows);
        if (method === "killSession") return killSession(params.sessionId);
        if (!Object.hasOwn(handlers, method)) throw new Error("Unknown request");
        const handler = handlers[method as keyof typeof handlers] as (params: never) => unknown;
        const result = await handler(params as never);
        socket.send(JSON.stringify({ id, result }));
      } catch (error) {
        let id: unknown;
        try {
          id = JSON.parse(String(message)).id;
        } catch {}
        socket.send(
          JSON.stringify({ id, error: error instanceof Error ? error.message : String(error) }),
        );
      }
    },
  },
});
console.log(`Web backend listening on 127.0.0.1:${DEV_BACKEND_PORT}`);
