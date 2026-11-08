import { networkInterfaces } from "node:os";
import { DEV_BACKEND_PORT } from "../shared/ports";
import type { BackendStatus, BunRequestHandlers } from "../shared/rpc-schema";
import { generatePin, startBackendServer } from "./backend-server";

export function createBackendController(handlers: BunRequestHandlers, staticDirectory: string) {
  let server: ReturnType<typeof startBackendServer> | undefined;
  let shared = false;
  let port = DEV_BACKEND_PORT;
  let pin = generatePin();
  let error: string | undefined;

  function start() {
    server = startBackendServer({
      handlers,
      staticDirectory,
      port,
      pin,
      hostname: shared ? "0.0.0.0" : "127.0.0.1",
    });
    error = undefined;
  }

  function status(): BackendStatus {
    const hosts = shared
      ? Object.values(networkInterfaces()).flatMap(
          (entries) =>
            entries
              ?.filter((entry) => entry.family === "IPv4" && !entry.internal)
              .map((entry) => entry.address) ?? [],
        )
      : ["127.0.0.1"];
    return {
      running: !!server,
      shared,
      port,
      pin,
      urls: server ? [...new Set(hosts)].map((host) => `http://${host}:${port}`) : [],
      error,
    };
  }

  try {
    start();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return {
    status,
    configure(options: { shared: boolean; port: number; regeneratePin?: boolean }) {
      if (
        typeof options.shared !== "boolean" ||
        !Number.isInteger(options.port) ||
        options.port < 1 ||
        options.port > 65535
      ) {
        throw new Error("Choose a port between 1 and 65535");
      }
      const previous = { shared, port, pin };
      server?.stop();
      server = undefined;
      shared = options.shared;
      port = options.port;
      if (options.regeneratePin) {
        do {
          pin = generatePin();
        } while (pin === previous.pin);
      }
      try {
        start();
      } catch (cause) {
        ({ shared, port, pin } = previous);
        try {
          start();
        } catch {
          error = "Backend could not be restarted";
        }
        throw new Error(
          `Unable to start backend: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
      return status();
    },
    stop() {
      server?.stop();
      server = undefined;
    },
  };
}
