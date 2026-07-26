#!/usr/bin/env node

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");

const port = parseInt(
  process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1] ||
    process.argv[process.argv.indexOf("--port") + 1] ||
    process.env.PORT ||
    "4242",
  10,
);

if (!existsSync(resolve(distDir, "index.html"))) {
  console.log("> No production build found. Building...");
  const { execSync } = await import("child_process");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}

process.env.NODE_ENV = "production";

const { Hono } = await import("hono");
const { serve } = await import("@hono/node-server");
const { serveStatic } = await import("@hono/node-server/serve-static");
const { WebSocketServer } = await import("ws");

const { apiRouter } = await import(resolve(root, "server/routes.ts"));
const { getSessions } = await import(resolve(root, "server/sessions.ts"));
const { terminalWS } = await import(resolve(root, "server/websocket.ts"));

const app = new Hono();
app.route("/api", apiRouter);
app.get("/api/terminal", terminalWS);
app.use("*", serveStatic({ root: distDir }));
app.get("*", serveStatic({ path: resolve(distDir, "index.html") }));

const websocketServer = new WebSocketServer({ noServer: true });
const server = serve({ port, fetch: app.fetch, websocket: { server: websocketServer } }, () => {
  console.log(`> Local Terminal ready on http://localhost:${port}`);
});

server.on("close", () => {
  for (const session of getSessions().values()) session.pty.kill();
  getSessions().clear();
});
