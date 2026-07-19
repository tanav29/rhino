# Local Shell Example

Full local terminal in the browser, connected to your machine's shell via WebSocket and [node-pty](https://github.com/microsoft/node-pty).

## Run as a package

After publishing, run the optimized production server directly with Bun:

```bash
bunx @10xdevs/term
bunx @10xdevs/term --port 8080
```

The default port is `4242`. The package builds once on first run when no production build is present, then starts the small custom HTTP + WebSocket server (not the Next development server).

## Setup

From the monorepo root:

```bash
pnpm install
zig build
pnpm --filter local dev
```

Opens at `local-example.wterm.localhost` via [portless](https://github.com/vercel-labs/portless).

## How It Works

- `server.ts` starts an HTTP + WebSocket server alongside Next.js
- On WebSocket connection, a PTY process is spawned with your default shell
- The browser sends keystrokes over WebSocket; the server relays PTY output back
- Terminal resizing is forwarded to the PTY via a custom escape sequence

## Key Files

| File | Description |
|---|---|
| `server.ts` | Custom server with WebSocket ↔ PTY bridge |
| `app/page.tsx` | Terminal page with auto-resize and WebSocket connection |
| `app/layout.tsx` | Root layout with metadata |
