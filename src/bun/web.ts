import { resolve } from "node:path";
import { DEV_BACKEND_PORT } from "../shared/ports";
import { createBackendHandlers } from "./backend-handlers";
import { generatePin, startBackendServer } from "./backend-server";
import { killAllSessions } from "./sessions";
import { flushWorkspace } from "./workspace-store";

const port = Number(process.env.TERM_PORT ?? DEV_BACKEND_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("TERM_PORT must be between 1 and 65535");
const hostname = process.env.TERM_HOST ?? "127.0.0.1";
const pin = process.env.TERM_PIN ?? generatePin();
const backend = startBackendServer({
  port,
  hostname,
  pin,
  handlers: createBackendHandlers(),
  staticDirectory: resolve("dist"),
});
const cleanup = () => {
  backend.stop();
  flushWorkspace();
  killAllSessions();
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
console.log(`Terminal backend listening on http://${hostname}:${backend.port}`);
console.log(`Connection PIN: ${pin}`);
