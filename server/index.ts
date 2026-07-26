import "dotenv/config";
import { Hono } from "hono";
import { csrf } from 'hono/csrf'
import { cors } from 'hono/cors'
import { apiRouter } from "./routes";
import { serve } from "@hono/node-server";
import { getSessions } from "./sessions";
import { terminalWS, debugWS } from "./websocket";
import { serveStatic } from "@hono/node-server/serve-static";

export const app = new Hono();

app.use(cors({
  origin: "http://localhost:5173"
}));
app.use(csrf({ origin: 'http://localhost:5173' }))

const NODE_ENV = process.env.NODE_ENV;

if (NODE_ENV === "production") {
  app.use(
    "*",
    serveStatic({
      root: "./dist",
    })
  );

  // SPA fallback
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

app.route("/api", apiRouter);
app.get("/api/terminal", terminalWS);
// app.get("/api/debug", debugWS);


const server = serve({ port: 4242, fetch: app.fetch }, () => {
  console.log(`> Local Terminal ready on http://localhost:4242`);
});

server.on("close", () => {
  for (const session of getSessions().values()) session.pty.kill();
  getSessions().clear();
});
