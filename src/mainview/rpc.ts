import { DEV_BACKEND_PORT, DEV_FRONTEND_PORT } from "../shared/ports";
import { Electroview } from "electrobun/view";
import type { AppRPC, RpcClient } from "../shared/rpc-schema";
import type { SessionEvent } from "../bun/sessions";
import { createBackendConnections } from "./backend-connections";

type Listener<T> = (payload: T) => void;
const outputListeners = new Map<string, Set<Listener<string>>>();
const titleListeners = new Map<string, Set<Listener<string>>>();
const cwdListeners = new Map<string, Set<Listener<string | null>>>();
const exitListeners = new Map<string, Set<Listener<undefined>>>();

function subscribe<T>(map: Map<string, Set<Listener<T>>>, sessionId: string, fn: Listener<T>) {
  let listeners = map.get(sessionId);
  if (!listeners) {
    listeners = new Set();
    map.set(sessionId, listeners);
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) map.delete(sessionId);
  };
}
function notify<T>(map: Map<string, Set<Listener<T>>>, sessionId: string, payload: T) {
  for (const fn of map.get(sessionId) ?? []) fn(payload);
}
function dispatch(event: SessionEvent) {
  if (event.kind === "output") notify(outputListeners, event.sessionId, event.data);
  if (event.kind === "title") notify(titleListeners, event.sessionId, event.title);
  if (event.kind === "cwd") notify(cwdListeners, event.sessionId, event.cwd);
  if (event.kind === "exit") notify(exitListeners, event.sessionId, undefined);
}

const isLocalActive = () => getConnection().status === "connected" && !getConnection().url;

const native = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {},
    messages: {
      ptyOutput: ({ sessionId, data }) => {
        if (isLocalActive()) dispatch({ kind: "output", sessionId, data });
      },
      ptyTitle: ({ sessionId, title }) => {
        if (isLocalActive()) dispatch({ kind: "title", sessionId, title });
      },
      ptyCwd: ({ sessionId, cwd }) => {
        if (isLocalActive()) dispatch({ kind: "cwd", sessionId, cwd });
      },
      ptyExit: ({ sessionId }) => {
        if (isLocalActive()) dispatch({ kind: "exit", sessionId });
      },
    },
  },
});

export const desktopRpc: RpcClient | null = window.__electrobun
  ? (() => {
      new Electroview({ rpc: native });
      return native as unknown as RpcClient;
    })()
  : null;

const browserUrl =
  location.port === String(DEV_FRONTEND_PORT)
    ? `${location.protocol}//${location.hostname}:${DEV_BACKEND_PORT}`
    : location.origin;
let storage: Storage | undefined;
try {
  storage = localStorage;
} catch {
  /* Storage may be unavailable. */
}
export const backendConnections = createBackendConnections({
  local: desktopRpc,
  initialUrl: browserUrl,
  storage,
  onEvent: dispatch,
});
export const getConnection = backendConnections.getSnapshot;
export const getBackendClient = backendConnections.getClient;
export const subscribeConnection = backendConnections.subscribe;
export const connectRemoteBackend = backendConnections.connect;
export const switchToLocalBackend = backendConnections.switchToLocal;

// Call sites keep the same typed RPC surface when the selected machine changes.
export const rpc: RpcClient = {
  request: new Proxy({} as RpcClient["request"], {
    get: (_, method: keyof RpcClient["request"]) => (params: never) => {
      try {
        return getBackendClient().request[method](params);
      } catch (cause) {
        return Promise.reject(cause);
      }
    },
  }),
  send: new Proxy({} as RpcClient["send"], {
    get: (_, method: keyof RpcClient["send"]) => (params: never) => {
      if (getConnection().status === "connected") getBackendClient().send[method](params);
    },
  }),
};

export function subscribePtyOutput(sessionId: string, fn: Listener<string>) {
  return subscribe(outputListeners, sessionId, fn);
}
export function subscribePtyTitle(sessionId: string, fn: Listener<string>) {
  return subscribe(titleListeners, sessionId, fn);
}
export function subscribePtyCwd(sessionId: string, fn: Listener<string | null>) {
  return subscribe(cwdListeners, sessionId, fn);
}
export function subscribePtyExit(sessionId: string, fn: Listener<undefined>) {
  return subscribe(exitListeners, sessionId, fn);
}
