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
// to a no-op transport so the UI still renders for agent-browser and `vite` dev.
try {
  new Electroview({ rpc: rpc as unknown as ReturnType<typeof Electroview.defineRPC<AppRPC>> });
} catch {
  // Running outside Electrobun (e.g. `vite` dev in a normal browser).
  (rpc as unknown as { request: RpcShape["request"] }).request = {
    loadWorkspace: async () => {
      try {
        const raw = localStorage.getItem("term.workspace:v1");
        return raw ? (JSON.parse(raw) as import("../shared/rpc-schema").WorkspaceSnapshot) : null;
      } catch {
        return null;
      }
    },
    saveWorkspace: async () => null,
    listShells: async () => [],
    browseDirectory: async () => ({ path: "/", parent: null, entries: [] }),
    listProjectFiles: async () => ({ paths: [] }),
    readFilePreview: async () => ({ error: "Not available in browser" }),
    readGitStatus: async () => "",
    readGitDiff: async () => ({ kind: "empty" as const }),
    attachSession: async () => ({ title: "Terminal", replay: "" }),
  };
  (rpc as unknown as { send: RpcShape["send"] }).send = {
    ptyInput: () => {},
    ptyResize: () => {},
    killSession: () => {},
  };
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
