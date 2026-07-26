import { Hono } from "hono";
import { apiRouter } from "./routes";
import { serve } from "@hono/node-server";
import { getSessions } from "./sessions";
import { terminalWS } from "./websocket";
import { serveStatic } from "@hono/node-server/serve-static";
import { resolve } from "path";

export const app = new Hono();

const NODE_ENV = process.env.NODE_ENV;
const distDir = resolve(process.cwd(), "dist");

app.route("/api", apiRouter);
app.get("/api/terminal", terminalWS);

if (NODE_ENV === "production") {
  app.use("*", serveStatic({ root: distDir }));
  app.get("*", serveStatic({ path: resolve(distDir, "index.html") }));
}

const server = serve({ port: 4242, fetch: app.fetch }, () => {
  console.log("> Local Terminal ready on http://localhost:4242");
});

server.on("close", () => {
  for (const session of getSessions().values()) session.pty.kill();
  getSessions().clear();
});