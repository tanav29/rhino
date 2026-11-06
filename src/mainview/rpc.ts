import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/rpc-schema";

type Listener<T> = (payload: T) => void;

function listenerMap<T>() {
  return new Map<string, Set<Listener<T>>>();
}

const outputListeners = listenerMap<string>();
const titleListeners = listenerMap<string>();
const exitListeners = listenerMap<undefined>();

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

type RpcShape = {
  request: {
    loadWorkspace: (p: {}) => Promise<import("../shared/rpc-schema").WorkspaceSnapshot | null>;
    saveWorkspace: (p: {
      workspace: import("../shared/rpc-schema").WorkspaceSnapshot;
    }) => Promise<null>;
    listShells: (p: {}) => Promise<import("../shared/rpc-schema").ShellOption[]>;
    browseDirectory: (p: {
      path?: string;
    }) => Promise<import("../shared/rpc-schema").DirectoryListing>;
    listProjectFiles: (p: { cwd: string }) => Promise<{ paths: string[]; error?: string }>;
    readFilePreview: (p: {
      cwd: string;
      path: string;
    }) => Promise<import("../shared/rpc-schema").FilePreview>;
    readGitStatus: (p: { cwd: string }) => Promise<string>;
    readGitDiff: (p: {
      cwd: string;
      path: string;
    }) => Promise<import("../shared/rpc-schema").GitDiffResult>;
    attachSession: (
      p: import("../shared/rpc-schema").AttachSessionParams,
    ) => Promise<import("../shared/rpc-schema").AttachSessionResult>;
  };
  send: {
    ptyInput: (p: { sessionId: string; data: string }) => void;
    ptyResize: (p: { sessionId: string; cols: number; rows: number }) => void;
    killSession: (p: { sessionId: string }) => void;
  };
};

export const rpc: RpcShape = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {},
    messages: {
      ptyOutput: ({ sessionId, data }) => notify(outputListeners, sessionId, data),
      ptyTitle: ({ sessionId, title }) => notify(titleListeners, sessionId, title),
      ptyExit: ({ sessionId }) => notify(exitListeners, sessionId, undefined),
    },
  },
}) as unknown as RpcShape;

// Attach the browser side of the transport exactly once per page load.
// In a plain browser (vite dev without Electrobun) this throws — fall back
// to the local Bun WebSocket transport.
try {
  new Electroview({ rpc: rpc as unknown as ReturnType<typeof Electroview.defineRPC<AppRPC>> });
} catch {
  // Running outside Electrobun (e.g. `vite` dev in a normal browser).
  const socket = new WebSocket("ws://127.0.0.1:5174");
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let nextId = 0;
  const connected = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Web backend unavailable")), {
      once: true,
    });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.event) {
      const event = message.event;
      if (event.kind === "output") notify(outputListeners, event.sessionId, event.data);
      if (event.kind === "title") notify(titleListeners, event.sessionId, event.title);
      if (event.kind === "exit") notify(exitListeners, event.sessionId, undefined);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) request.reject(new Error("Web backend disconnected"));
    pending.clear();
  });
  const call = async (method: string, params: unknown) => {
    await connected;
    if (socket.readyState !== WebSocket.OPEN) throw new Error("Web backend disconnected");
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  (rpc as unknown as { request: RpcShape["request"] }).request = new Proxy(
    {
      loadWorkspace: async () => {
        try {
          return JSON.parse(localStorage.getItem("term.workspace:v1") ?? "null");
        } catch {
          return null;
        }
      },
      saveWorkspace: async ({ workspace }: { workspace: unknown }) => {
        localStorage.setItem("term.workspace:v1", JSON.stringify(workspace));
        return null;
      },
    },
    {
      get: (target, key: string) =>
        key in target ? target[key as keyof typeof target] : (params: unknown) => call(key, params),
    },
  ) as unknown as RpcShape["request"];
  (rpc as unknown as { send: RpcShape["send"] }).send = new Proxy({} as RpcShape["send"], {
    get: (_, method: string) => (params: unknown) => {
      void connected
        .then(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ method, params }));
        })
        .catch(() => undefined);
    },
  });
}

export function subscribePtyOutput(sessionId: string, fn: Listener<string>) {
  return subscribe(outputListeners, sessionId, fn);
}
export function subscribePtyTitle(sessionId: string, fn: Listener<string>) {
  return subscribe(titleListeners, sessionId, fn);
}
export function subscribePtyExit(sessionId: string, fn: Listener<undefined>) {
  return subscribe(exitListeners, sessionId, fn);
}
