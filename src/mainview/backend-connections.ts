import type { RpcClient } from "../shared/rpc-schema";
import type { SessionEvent } from "../bun/sessions";
import { connectBackendSocket, parseBackendLink } from "./backend-client";

type Status = "connected" | "connecting" | "disconnected";
export interface Machine {
  url: string;
  name: string;
  status: Status;
}
const MACHINES_KEY = "rhino.machines:v1";

/** Keep authenticated sockets alive when another machine is selected. Never persist credentials. */
export function createBackendConnections(options: {
  local: RpcClient | null;
  initialUrl: string;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  onEvent: (event: SessionEvent) => void;
}) {
  const connections = new Map<string, Awaited<ReturnType<typeof connectBackendSocket>>>();
  const attempts = new Map<string, object>();
  let active = options.local;
  let selection = 0;
  let state: {
    status: Status;
    url: string;
    error: string;
    generation: number;
    machines: Machine[];
  } = {
    status: active ? "connected" : "disconnected",
    url: active ? "" : options.initialUrl,
    error: "",
    generation: 0,
    machines: [],
  };
  try {
    const saved: unknown = JSON.parse(options.storage?.getItem(MACHINES_KEY) ?? "[]");
    const legacyUrl = options.storage?.getItem("term.backendUrl:v1");
    if (Array.isArray(saved) && legacyUrl) {
      try {
        const { url } = parseBackendLink(legacyUrl);
        saved.push({ url, name: new URL(url).hostname });
      } catch {
        /* Ignore an invalid legacy address. */
      }
    }
    if (Array.isArray(saved)) {
      const urls = new Set<string>();
      for (const machine of saved.slice(0, 50)) {
        if (typeof machine?.url !== "string" || typeof machine?.name !== "string") continue;
        try {
          const { url } = parseBackendLink(machine.url);
          if (urls.has(url)) continue;
          urls.add(url);
          state.machines.push({ url, name: machine.name.slice(0, 80), status: "disconnected" });
        } catch {
          /* Ignore invalid saved addresses. */
        }
      }
    }
  } catch {
    /* Storage may be unavailable. */
  }
  const listeners = new Set<() => void>();
  function update(next: Partial<typeof state>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }
  function persist() {
    try {
      options.storage?.setItem(
        MACHINES_KEY,
        JSON.stringify(state.machines.map(({ url, name }) => ({ url, name }))),
      );
      options.storage?.removeItem("term.backendUrl:v1");
    } catch {
      /* Storage may be unavailable. */
    }
  }
  function machineStatus(url: string, status: Status) {
    return state.machines.map((machine) =>
      machine.url === url ? { ...machine, status } : machine,
    );
  }
  function select(url: string, client: RpcClient) {
    selection++;
    active = client;
    update({ url, status: "connected", error: "", generation: state.generation + 1 });
  }

  return {
    getSnapshot: () => state,
    getClient() {
      if (!active) throw new Error("Backend disconnected");
      return active;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    switchToLocal() {
      if (!options.local) return;
      if (state.url || state.status !== "connected") select("", options.local);
      else selection++;
    },
    switchToRemote(url: string) {
      const connection = connections.get(url);
      if (!connection) return false;
      if (state.url !== url || state.status !== "connected") select(url, connection.client);
      else selection++;
      return true;
    },
    forget(url: string) {
      attempts.delete(url);
      const connection = connections.get(url);
      connections.delete(url);
      connection?.close();
      if (state.url === url) {
        if (options.local) select("", options.local);
        else {
          selection++;
          active = null;
          update({ status: "disconnected", url: options.initialUrl, error: "" });
        }
      }
      update({ machines: state.machines.filter((machine) => machine.url !== url) });
      persist();
    },
    async connect(value: string, pin: string, name?: string) {
      const { url, token } = parseBackendLink(value);
      if (!/^\d{6}$/.test(pin))
        throw new Error("Enter the six-digit PIN shown on the host machine");
      const attempt = {};
      attempts.set(url, attempt);
      const selected = ++selection;
      const existing = state.machines.find((machine) => machine.url === url);
      const machine: Machine = {
        url,
        name: name?.trim().slice(0, 80) || existing?.name || new URL(url).hostname,
        status: "connecting",
      };
      // Leave the current workspace usable until the new connection authenticates.
      update({ machines: [...state.machines.filter((item) => item.url !== url), machine] });
      let connection: Awaited<ReturnType<typeof connectBackendSocket>> | undefined;
      let closed = false;
      try {
        connection = await connectBackendSocket({
          url,
          pin,
          token,
          onEvent(event) {
            if (connection && active === connection.client) options.onEvent(event);
          },
          onClose() {
            closed = true;
            if (!connection || connections.get(url) !== connection) return;
            connections.delete(url);
            if (active === connection.client) {
              active = null;
              update({
                status: "disconnected",
                error: "Backend disconnected. Enter the PIN and complete share link to reconnect.",
              });
            }
            update({ machines: machineStatus(url, "disconnected") });
          },
        });
        if (closed) throw new Error("Backend disconnected");
        if (attempts.get(url) !== attempt) {
          connection.close();
          return;
        }
        const previous = connections.get(url);
        connections.set(url, connection);
        previous?.close();
        update({ machines: machineStatus(url, "connected") });
        persist();
        if (selected === selection || (previous && active === previous.client))
          select(url, connection.client);
      } catch (cause) {
        if (attempts.get(url) === attempt)
          update({
            machines: machineStatus(url, connections.has(url) ? "connected" : "disconnected"),
          });
        throw cause;
      } finally {
        if (attempts.get(url) === attempt) attempts.delete(url);
      }
    },
    close() {
      selection++;
      attempts.clear();
      active = null;
      for (const connection of connections.values()) connection.close();
      connections.clear();
      update({
        status: "disconnected",
        machines: state.machines.map((m) => ({ ...m, status: "disconnected" })),
      });
    },
  };
}
