export const sessionSockets = new Map<string, WebSocket>();

export function closeSessionSocket(id: string) {
  const ws = sessionSockets.get(id);
  sessionSockets.delete(id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send("\x1b[CLOSE]");
    ws.close();
  } else {
    ws?.close();
  }
}
