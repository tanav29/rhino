- use bun
- code like a senior dev
- never run a dev server unless explicitly asked
- do minimal changes

## Project Overview

`wterm` is a browser-based terminal built with React, xterm.js, and node-pty. It runs a custom HTTP + WebSocket server (`server.ts`) that bridges browser terminals to local shell PTY processes.

## Key Directories

- `server.ts` — Express-like HTTP + WebSocket server; PTY management, file browsing, git integration
- `src/` — React frontend: `App.tsx` (root), `session-view.tsx` (xterm wrapper), `session-tabs.tsx`, etc.
- `components/ui/` — shadcn/ui components built on `@base-ui/react`
- `lib/` — Shared utilities (`cn`, `execFileAsync`)
- `utils/` — Shell detection utilities
- `bin/` — Production entrypoint (`term.mjs`)

## Scripts

- `bun run dev` — starts Vite dev server + backend concurrently
- `bun run build` — production build to `dist/`
- `bun run lint` — ESLint
- `bun run type-check` — TypeScript check
