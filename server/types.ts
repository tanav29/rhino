import { WebSocket } from "ws";

export interface SessionPTY {
  pty: import("node-pty").IPty;
  clients: Set<WebSocket>;
  title: string;
  titleBuffer: string;
  createdAt: number;
}

export interface ServerOptions {
  hostname?: string;
  port?: number;
  staticDir?: string;
  development?: boolean;
}
