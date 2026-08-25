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

export const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {},
    messages: {
      ptyOutput: ({ sessionId, data }) => notify(outputListeners, sessionId, data),
      ptyTitle: ({ sessionId, title }) => notify(titleListeners, sessionId, title),
      ptyExit: ({ sessionId }) => notify(exitListeners, sessionId, undefined),
    },
  },
});

// Attach the browser side of the transport exactly once per page load.
new Electroview({ rpc });

export function subscribePtyOutput(sessionId: string, fn: Listener<string>) {
  return subscribe(outputListeners, sessionId, fn);
}

export function subscribePtyTitle(sessionId: string, fn: Listener<string>) {
  return subscribe(titleListeners, sessionId, fn);
}

export function subscribePtyExit(sessionId: string, fn: Listener<undefined>) {
  return subscribe(exitListeners, sessionId, fn);
}
