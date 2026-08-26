- use bun
- code like a senior dev
- do minimal changes

## Project Overview

`term` is a native desktop terminal built with React, wterm, Ghostty, and Electrobun. The Bun main process manages PTY sessions via `Bun.Terminal`; the React webview renders terminals and talks to the main process over Electrobun's typed RPC bridge.

## Key Directories

- `src/bun/` — Electrobun main process (Bun runtime): `index.ts` (window + RPC wiring), `sessions.ts` (`Bun.Terminal` PTY manager), `api.ts` (shells/browse/files/git handlers), `workspace-store.ts` (persisted layout under `userData`)
- `src/shared/rpc-schema.ts` — typed `AppRPC` contract imported by both sides
- `src/mainview/` — React webview: `App.tsx` (workspace/panes), `session-view.tsx` (Ghostty + RPC transport), `rpc.ts` (Electroview singleton), `git-status.ts`, panels/dialogs, `globals.css`
- `components/ui/` — shadcn/ui on `@base-ui/react`
- `lib/utils.ts` — `cn` helper
- `assets/icon.ico` — Windows app icon (generated from `logo.png`)
- `electrobun.config.ts` / `hutch.config.ts` — app metadata, build, and task definitions

## Scripts

- `bun run dev` — HMR: Vite dev server + Electrobun desktop app (`hutch run dev:hmr`)
- `bun run dev:bundled` — without HMR, loads the Vite build via `views://`
- `bun run build` — production installer (`hutch run build`, outputs to `build/`)
- `bun run lint` / `lint:fix` — oxlint
- `bun run fmt` / `fmt:check` — oxfmt
- `bun run type-check` — `tsc --noEmit`

Hutch tasks live in `hutch.config.ts` (`install`, `start`, `dev`, `dev:hmr`, `hmr`, `build`, `build:canary`). Vite builds to `dist/` and is copied into the Electrobun bundle via `build.copy`.

## Notes

- Shell detection lives in `src/bun/shells.ts`; PTY output is coalesced (8ms) before `rpc.send.ptyOutput`.
- Workspace layout is persisted as JSON under `Utils.paths.userData` (`workspace.json`), not localStorage.
- `vite.config.ts` contains a `slimShiki` build plugin that trims shiki's 200+ grammars / 60+ themes to the languages actually used and `aurora-x` (keeps the webview bundle ~5MB vs ~12MB unslimmed).
- Windows app icon configured in `electrobun.config.ts` (`win.icon: "assets/icon.ico"`); regenerate with `bun <tmp>/make-ico.ts` after changing `logo.png`.
