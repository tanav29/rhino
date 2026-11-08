import type { RpcClient } from "../shared/rpc-schema";
import type { SessionEvent } from "../bun/sessions";

export function normalizeBackendUrl(value: string) {
  const url = new URL(value.trim());
  if (
    !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Enter a backend URL such as http://192.168.1.10:43188");
  }
  url.protocol = url.protocol === "wss:" || url.protocol === "https:" ? "https:" : "http:";
  url.pathname = url.pathname.replace(/\/ws\/?$/, "").replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

export async function connectBackendSocket(options: {
  url: string;
  pin: string;
  onEvent: (event: SessionEvent) => void;
  onClose: () => void;
}) {
  const url = new URL(`${normalizeBackendUrl(options.url)}/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let nextId = 0;
  const rejectAll = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Backend disconnected"));
    }
    pending.clear();
  };
  socket.addEventListener("message", ({ data }) => {
    try {
      const message = JSON.parse(String(data));
      if (message.event) {
        options.onEvent(message.event);
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
    } catch {
      /* Ignore malformed messages from an incompatible backend. */
    }
  });
  socket.addEventListener("close", () => {
    rejectAll();
    options.onClose();
  });

  const call = (method: string, params: unknown, timeout = 60_000) =>
    new Promise<unknown>((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error("Backend disconnected"));
        return;
      }
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Backend request timed out"));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Unable to reach backend. Check the URL and network sharing.")),
        8000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      socket.addEventListener("open", () => finish(), { once: true });
      socket.addEventListener(
        "error",
        () => finish(new Error("Unable to reach backend. Check the URL and network sharing.")),
        { once: true },
      );
      socket.addEventListener("close", () => finish(new Error("Backend disconnected")), {
        once: true,
      });
    });
    await call("authenticate", { pin: options.pin }, 8000);
  } catch (error) {
    socket.close();
    throw error;
  }

  const client: RpcClient = {
    request: new Proxy({} as RpcClient["request"], {
      get: (_, method: string) => (params: unknown) => call(method, params),
    }),
    send: new Proxy({} as RpcClient["send"], {
      get: (_, method: string) => (params: unknown) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ method, params }));
      },
    }),
  };
  return { client, close: () => socket.close() };
}
