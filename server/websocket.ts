import { upgradeWebSocket } from "@hono/node-server";
import { handlePTYConnection } from "./sessions";
import { WebSocket } from "ws";

export const terminalWS = upgradeWebSocket((c) => {
  const sessionId = c.req.query("session") ?? undefined;
  const shellValue = c.req.query("shell") ?? undefined;
  const cwd = c.req.query("cwd") ?? undefined;
  return {
    onOpen(_evt, ws) {
      handlePTYConnection(ws.raw as WebSocket, sessionId, shellValue, cwd);
    },
  };
});