import { DEV_BACKEND_PORT, DEV_FRONTEND_PORT } from "../shared/ports";
import { Electroview } from "electrobun/view";
import type { AppRPC, RpcClient } from "../shared/rpc-schema";
import type { SessionEvent } from "../bun/sessions";
import { connectBackendSocket, normalizeBackendUrl } from "./backend-client";

type Listener<T> = (payload: T) => void;
const outputListeners = new Map<string, Set<Listener<string>>>();
const titleListeners = new Map<string, Set<Listener<string>>>();
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
  if (event.kind === "exit") notify(exitListeners, event.sessionId, undefined);
}

let active: RpcClient | null = null;

const native = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {},
    messages: {
      ptyOutput: ({ sessionId, data }) => {
        if (active === (native as unknown as RpcClient))
          dispatch({ kind: "output", sessionId, data });
      },
      ptyTitle: ({ sessionId, title }) => {
        if (active === (native as unknown as RpcClient))
          dispatch({ kind: "title", sessionId, title });
      },
      ptyExit: ({ sessionId }) => {
        if (active === (native as unknown as RpcClient)) dispatch({ kind: "exit", sessionId });
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

const URL_KEY = "term.backendUrl:v1";
function savedUrl() {
  try {
    return localStorage.getItem(URL_KEY) ?? "";
  } catch {
    return "";
  }
}
const rememberedUrl = savedUrl();
const browserUrl =
  location.port === String(DEV_FRONTEND_PORT)
    ? `${location.protocol}//${location.hostname}:${DEV_BACKEND_PORT}`
    : location.origin;
active = rememberedUrl || !desktopRpc ? null : desktopRpc;
let network: Awaited<ReturnType<typeof connectBackendSocket>> | undefined;
let generation = 0;
let state: {
  status: "connected" | "connecting" | "disconnected";
  url: string;
  error: string;
  generation: number;
} = {
  status: active ? "connected" : "disconnected",
  url: rememberedUrl || (desktopRpc ? "" : browserUrl),
  error: "",
  generation,
};
const connectionListeners = new Set<() => void>();
function update(next: Partial<typeof state>) {
  state = { ...state, ...next };
  for (const listener of connectionListeners) listener();
}
export const getConnection = () => state;
export function getBackendClient(): RpcClient {
  if (!active) throw new Error("Backend disconnected");
  return active;
}
export const subscribeConnection = (listener: () => void) => {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
};

export async function connectRemoteBackend(value: string, pin: string) {
  const url = normalizeBackendUrl(value);
  if (!/^\d{6}$/.test(pin)) throw new Error("Enter the six-digit PIN shown on the host machine");
  const attempt = ++generation;
  network?.close();
  network = undefined;
  active = null;
  update({ status: "connecting", url, error: "" });
  let established = false;
  try {
    const connection = await connectBackendSocket({
      url,
      pin,
      onEvent: (event) => {
        if (attempt === generation && active) dispatch(event);
      },
      onClose: () => {
        if (attempt !== generation || !established) return;
        active = null;
        update({
          status: "disconnected",
          error: "Backend disconnected. Enter the PIN to reconnect.",
        });
      },
    });
    if (attempt !== generation) {
      connection.close();
      return;
    }
    network = connection;
    established = true;
    active = connection.client;
    try {
      localStorage.setItem(URL_KEY, url);
    } catch {
      /* Storage may be unavailable. */
    }
    update({ status: "connected", generation: attempt, error: "" });
  } catch (error) {
    if (attempt === generation)
      update({
        status: "disconnected",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    throw error;
  }
}

export function switchToLocalBackend() {
  if (!desktopRpc) return;
  generation++;
  network?.close();
  network = undefined;
  active = desktopRpc;
  try {
    localStorage.removeItem(URL_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
  update({ status: "connected", url: "", error: "", generation });
}

// Call sites keep the same typed RPC surface when the selected machine changes.
export const rpc: RpcClient = {
  request: new Proxy({} as RpcClient["request"], {
    get: (_, method: keyof RpcClient["request"]) => (params: never) => {
      if (!active) return Promise.reject(new Error("Backend disconnected"));
      return active.request[method](params);
    },
  }),
  send: new Proxy({} as RpcClient["send"], {
    get: (_, method: keyof RpcClient["send"]) => (params: never) => active?.send[method](params),
  }),
};

export function subscribePtyOutput(sessionId: string, fn: Listener<string>) {
  return subscribe(outputListeners, sessionId, fn);
}
export function subscribePtyTitle(sessionId: string, fn: Listener<string>) {
  return subscribe(titleListeners, sessionId, fn);
}
export function subscribePtyExit(sessionId: string, fn: Listener<undefined>) {
  return subscribe(exitListeners, sessionId, fn);
}
