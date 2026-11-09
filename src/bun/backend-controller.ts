import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import { DEV_BACKEND_PORT } from "../shared/ports";
import type { BackendStatus, BunRequestHandlers } from "../shared/rpc-schema";
import { generatePin, startBackendServer } from "./backend-server";
import { createCloudflareTunnel } from "./cloudflare-tunnel";

export function createBackendController(handlers: BunRequestHandlers, staticDirectory: string) {
  let server: ReturnType<typeof startBackendServer> | undefined;
  let shared = false;
  let port = DEV_BACKEND_PORT;
  let pin = generatePin();
  let error: string | undefined;
  let publicServer: ReturnType<typeof startBackendServer> | undefined;
  let accessToken = "";
  const tunnel = createCloudflareTunnel({
    onStopped() {
      publicServer?.stop();
      publicServer = undefined;
      accessToken = "";
    },
  });

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
      internet: {
        ...tunnel.status(),
        url: tunnel.status().url ? `${tunnel.status().url}#token=${accessToken}` : undefined,
      },
    };
  }

  try {
    start();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return {
    status,
    setInternetSharing({ enabled }: { enabled: boolean }) {
      if (typeof enabled !== "boolean") throw new Error("Invalid sharing option");
      if (!enabled) tunnel.stop();
      else if (!publicServer) {
        accessToken = randomBytes(32).toString("base64url");
        try {
          publicServer = startBackendServer({
            handlers,
            staticDirectory,
            port: 0,
            pin,
            accessToken,
            hostname: "127.0.0.1",
          });
          tunnel.start(`http://127.0.0.1:${publicServer.port}`);
        } catch (cause) {
          tunnel.stop();
          throw cause;
        }
      }
      return status();
    },
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
      tunnel.stop();
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
      tunnel.stop();
      server?.stop();
      server = undefined;
    },
  };
}
