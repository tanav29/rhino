# wterm

Full local terminal in the browser, connected to your machine's shell via WebSocket and [node-pty](https://github.com/microsoft/node-pty).

## Run as a package

After publishing, run the optimized production server directly with Bun:

```bash
bunx @10xdevs/term
bunx @10xdevs/term --port 8080
```

The default port is `4242`. The package builds once on first run when no production build is present, then starts the small custom HTTP + WebSocket server.

## Setup

From the repo root:

```bash
bun install
bun run dev
```

Opens at `http://localhost:5173` (Vite dev server) with the backend on `http://localhost:4242`.

## How It Works

- `server.ts` starts an HTTP + WebSocket server
- On WebSocket connection, a PTY process is spawned with your default shell
- The browser sends keystrokes over WebSocket; the server relays PTY output back
- Terminal resizing is forwarded to the PTY via a custom escape sequence

## Key Files

| File                      | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `server.ts`               | Custom server with WebSocket ↔ PTY bridge      |
| `src/App.tsx`             | Main React app with project/session management |
| `src/session-view.tsx`    | Individual terminal view using xterm.js        |
| `src/session-tabs.tsx`    | Tab bar for managing terminal sessions         |
| `src/file-tree-panel.tsx` | File browser with diff viewer                  |
| `src/git-panel.tsx`       | Git status and diff viewer                     |
| `src/api.ts`              | CSRF-aware fetch helper                        |
| `src/session-sockets.ts`  | WebSocket session tracking                     |
| `utils/shells.ts`         | Shell detection utilities                      |
