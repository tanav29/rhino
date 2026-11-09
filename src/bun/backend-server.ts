import { randomInt, timingSafeEqual } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import type { BunRequestHandlers } from "../shared/rpc-schema";
import { killSession, resizePty, subscribeSessionEvents, writePtyInput } from "./sessions";

export const generatePin = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

type SocketData = {
  authenticated: boolean;
  ip: string;
  timer: ReturnType<typeof setTimeout> | undefined;
  inFlight: number;
};

const isString = (value: unknown): value is string => typeof value === "string";
const isSize = (value: unknown) =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) <= 1000;
const isSession = (params: Record<string, unknown>) =>
  isString(params.sessionId) && params.sessionId.length > 0 && params.sessionId.length <= 200;
const optionalString = (value: unknown) => value === undefined || isString(value);

// Only this explicit surface is exposed to network clients. Sharing controls stay local.
const validators: Record<string, (params: Record<string, unknown>) => boolean> = {
  listAgents: () => true,
  listShells: () => true,
  browseDirectory: (p) => optionalString(p.path),
  listProjectFiles: (p) => isString(p.cwd),
  readGitStatus: (p) => isString(p.cwd),
  readGitDiff: (p) => isString(p.cwd) && isString(p.path),
  loadWorkspace: () => true,
  saveWorkspace: (p) => {
    const w = p.workspace as Record<string, unknown> | null;
    return (
      !!w &&
      Array.isArray(w.projects) &&
      Array.isArray(w.panes) &&
      isString(w.activeProjectId) &&
      isString(w.activeSessionId)
    );
  },
  attachSession: (p) =>
    isSession(p) &&
    isSize(p.cols) &&
    isSize(p.rows) &&
    optionalString(p.shell) &&
    optionalString(p.cwd) &&
    optionalString(p.sourceSessionId),
  ptyInput: (p) => isSession(p) && isString(p.data),
  ptyResize: (p) => isSession(p) && isSize(p.cols) && isSize(p.rows),
  killSession: isSession,
};

export function startBackendServer(options: {
  port: number;
  hostname: string;
  pin: string;
  staticDirectory: string;
  handlers: BunRequestHandlers;
  accessToken?: string;
}) {
  if (!/^\d{6}$/.test(options.pin)) throw new Error("PIN must contain exactly six digits");
  const sockets = new Set<ServerWebSocket<SocketData>>();
  const attempts = new Map<string, { count: number; until: number }>();
  let globalAttempts = { count: 0, until: 0 };
  const pin = Buffer.from(options.pin);

  function authenticate(ip: string, candidate: unknown) {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    if (globalAttempts.until <= now) globalAttempts = { count: 0, until: now + 60_000 };
    const entry = attempts.get(ip) ?? { count: 0, until: now + 60_000 };
    if (entry.count >= 5 || globalAttempts.count >= 30)
      throw new Error("Too many PIN attempts. Try again in one minute.");
    if (
      !isString(candidate) ||
      !/^\d{6}$/.test(candidate) ||
      !timingSafeEqual(pin, Buffer.from(candidate))
    ) {
      entry.count++;
      globalAttempts.count++;
      attempts.set(ip, entry);
      throw new Error("Incorrect PIN");
    }
    attempts.delete(ip);
  }

  const server = Bun.serve<SocketData>({
    hostname: options.hostname,
    port: options.port,
    maxRequestBodySize: 1024,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/ws") {
        if (sockets.size >= 64) return new Response("Too many connections", { status: 503 });
        const data: SocketData = {
          authenticated: false,
          ip: server.requestIP(request)?.address ?? "unknown",
          timer: undefined,
          inFlight: 0,
        };
        if (server.upgrade(request, { data })) return;
        return new Response("WebSocket required", { status: 426 });
      }
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response("Method not allowed", { status: 405 });
      // Resolve symlinks too: static serving must never expose files outside the webview bundle.
      try {
        const root = await realpath(options.staticDirectory);
        const path = decodeURIComponent(url.pathname);
        const file = await realpath(resolve(root, path === "/" ? "index.html" : `.${path}`));
        const rel = relative(root, file);
        if (rel.startsWith("..") || isAbsolute(rel))
          return new Response("Forbidden", { status: 403 });
        const asset = Bun.file(file);
        if (!(await asset.exists())) return new Response("Not found", { status: 404 });
        return new Response(request.method === "HEAD" ? null : asset, {
          headers: {
            "Content-Type": asset.type,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return new Response("Web interface unavailable. Build it with bun run build:web.", {
          status: 404,
        });
      }
    },
    websocket: {
      maxPayloadLength: 1_048_576,
      backpressureLimit: 1_048_576,
      closeOnBackpressureLimit: true,
      idleTimeout: 120,
      open(socket) {
        sockets.add(socket);
        socket.data.timer = setTimeout(() => socket.close(1008, "PIN required"), 10_000);
      },
      close(socket) {
        clearTimeout(socket.data.timer);
        sockets.delete(socket);
      },
      async message(socket, message) {
        let id: number | undefined;
        let counted = false;
        try {
          const payload = JSON.parse(String(message));
          if (!payload || typeof payload !== "object") throw new Error("Invalid request");
          if (Number.isSafeInteger(payload.id)) id = payload.id;
          const { method, params } = payload;
          if (!socket.data.authenticated) {
            if (method !== "authenticate" || id === undefined) throw new Error("PIN required");
            if (options.accessToken) {
              const candidate = params?.token;
              const expected = Buffer.from(options.accessToken);
              if (
                !isString(candidate) ||
                Buffer.byteLength(candidate) !== expected.length ||
                !timingSafeEqual(expected, Buffer.from(candidate))
              )
                throw new Error(
                  "Invalid share link. Paste the complete link from the host machine.",
                );
            }
            authenticate(socket.data.ip, params?.pin);
            socket.data.authenticated = true;
            clearTimeout(socket.data.timer);
            socket.send(JSON.stringify({ id, result: null }));
            return;
          }
          if (
            !isString(method) ||
            !Object.hasOwn(validators, method) ||
            !params ||
            typeof params !== "object" ||
            Array.isArray(params) ||
            !validators[method](params)
          ) {
            throw new Error("Invalid request");
          }
          if (socket.data.inFlight >= 32) throw new Error("Too many requests");
          socket.data.inFlight++;
          counted = true;
          if (method === "ptyInput") {
            writePtyInput(params.sessionId, params.data);
            return;
          }
          if (method === "ptyResize") {
            resizePty(params.sessionId, params.cols, params.rows);
            return;
          }
          if (method === "killSession") {
            killSession(params.sessionId);
            return;
          }
          const handler = options.handlers[method as keyof BunRequestHandlers] as
            | ((params: unknown) => unknown)
            | undefined;
          if (!handler) throw new Error("Unknown request");
          const result = await handler(params);
          socket.send(JSON.stringify({ id, result }));
        } catch (error) {
          socket.send(
            JSON.stringify({
              id,
              error: error instanceof Error ? error.message : "Invalid request",
            }),
          );
          if (!socket.data.authenticated) socket.close(1008, "Authentication failed");
        } finally {
          if (counted) socket.data.inFlight--;
        }
      },
    },
  });
  const unsubscribe = subscribeSessionEvents((event) => {
    const message = JSON.stringify({ event });
    for (const socket of sockets) if (socket.data.authenticated) socket.send(message);
  });
  return {
    port: server.port!,
    stop() {
      unsubscribe();
      for (const socket of sockets) {
        clearTimeout(socket.data.timer);
        socket.close(1001, "Backend stopped");
      }
      server.stop(true);
    },
  };
}
