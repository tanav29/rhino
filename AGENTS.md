- use bun
- code like a senior dev
- never run a dev server unless explicitly asked
- do minimal changes

## Project Overview

`term` is a browser-based terminal built with React, wterm, Ghostty, and node-pty. It runs a custom HTTP + WebSocket server that bridges browser terminals to local shell PTY processes.

## Key Directories

- `server.ts` — Express-like HTTP + WebSocket server; PTY management, file browsing, git integration
- `src/` — React frontend: `App.tsx` (root), `session-view.tsx` (Ghostty wrapper), `session-tabs.tsx`, etc.
- `components/ui/` — shadcn/ui components built on `@base-ui/react`
- `lib/` — Shared utilities (`cn`, `execFileAsync`)
- `utils/` — Shell detection utilities
- `bin/` — Production entrypoint (`term.mjs`)

## Scripts

- `bun run dev` — starts Vite dev server + backend concurrently
- `bun run build` — production build to `dist/`
- `bun run lint` — ESLint
- `bun run type-check` — TypeScript check

<!-- to:todo-instructions:start -->

## Project TODOs

This project uses the `to` CLI for project-scoped task tracking.

- Run `to ls` to inspect current tasks before starting work.
- Run `to tree <number>` to inspect a task and its subtasks.
- Run `to add "task text"` to add follow-up work.
- Run `to add "task text" --parent <number>` to add subtasks.
- Use `--priority <high|medium|low>` and `--label <label>` for task metadata.
- Run `to done <number>` when a task is complete.
- Prefer `to do <number> --create-branch` when starting agent-driven work.

<!-- to:todo-instructions:end -->
