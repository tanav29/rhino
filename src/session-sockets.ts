import type { WebSocketTransport } from "@wterm/react";

export const sessionSockets = new Map<string, WebSocketTransport>();

export function closeSessionSocket(id: string) {
  const transport = sessionSockets.get(id);
  sessionSockets.delete(id);
  if (!transport) return;
  // `send` buffers while reconnecting, so explicitly close immediately after
  // asking the PTY to exit rather than leaving an orphaned reconnect loop.
  transport.send("\x1b[CLOSE]");
  transport.close();
}
