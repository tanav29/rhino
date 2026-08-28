# term

Native desktop terminal — [wterm](https://wterm.dev) + [Ghostty](https://ghostty.org) rendering, [Bun.Terminal](https://bun.com/reference/bun/Terminal) PTYs, packaged with [Electrobun](https://blackboard.sh/electrobun/).

![term icon](assets/icon.ico)

## Features

- **Real shell** — PTYs via `Bun.Terminal` (ConPTY on Windows)
- **Multi-session tabs & split panes** — row/column splits with per-pane terminals
- **File tree** — project files with git-aware status
- **Git panel** — changed files + inline diffs (aurora-x, shiki)
- **Shell detection** — cmd / PowerShell / pwsh / git-bash / WSL / bash / zsh
- **Workspaces** — multiple projects, persisted under the app's `userData` dir

## Requirements

- [Bun](https://bun.sh) 1.4+
- Hutch — Electrobun's CLI. `term` pins `electrobun@2.0.1` in `hutch.config.ts`.

```powershell
# Windows PowerShell
& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))
hutch --version
```

`hutch electrobun prepare` projects the devkit into `.hutch/devkit` (tsconfig paths + Vite aliases). Run `bun install && hutch electrobun prepare` after cloning.

> **Windows + broken IPv6:** if `hutch electrobun prepare` fails with `ReleaseDownloadFailed` on a host that has IPv6 routes but no IPv6 egress, prefer IPv4:
>
> ```powershell
> netsh interface ipv6 set prefixpolicy ::ffff:0:0/96 50 0
> ```

## Run

```bash
bun install
hutch electrobun prepare

# HMR (Vite on :5173, app loads from http://localhost:5173)
bun run dev

# or without HMR (app loads bundled views://)
bun run dev:bundled
```

## Build installers

```bash
bun run build              # --env=stable  → build/canary-win-x64/term-Setup-*.exe etc.
hutch run build:canary     # canary channel (separate install)
```

The Windows icon is `assets/icon.ico` (multi-size, generated from `logo.png`). Rebuild it with:

```bash
bun /tmp/*/make-ico.ts  # or: bun scripts/make-ico.ts after adding it
```

and `electrobun.config.ts` (`win.icon`) picks it up.

## How it works

```
src/bun/index.ts         BrowserWindow + BrowserView.defineRPC(AppRPC)
src/bun/sessions.ts      Bun.Terminal per session (cols/rows/data/exit)
src/bun/api.ts           shells / browse / files / git handlers
src/shared/rpc-schema.ts typed AppRPC (both sides import this)
src/mainview/rpc.ts      Electroview singleton + per-session event bus
src/mainview/App.tsx     workspace hydration/persistence via rpc
src/mainview/session-view.tsx  Ghostty + rpc attach/input/resize
```

`vite.config.ts` has a `slimShiki` plugin that trims shiki to ~40 common languages + `aurora-x`, keeping `dist/assets` ~5MB.

## Keyboard shortcuts

| Shortcut               | Action           |
| ---------------------- | ---------------- |
| `⌘T` / `Ctrl+T`        | New terminal     |
| `⌘D` / `Ctrl+D`        | Split right      |
| `⌘⇧D` / `Ctrl+Shift+D` | Split down       |
| `⌘N` / `Ctrl+N`        | New workspace    |
| `Ctrl+Tab` / `Shift`   | Next / prev tab  |
| `⌘1-9` / `Ctrl+1-9`    | Switch workspace |

## Scripts

| Script                      | What it does   |
| --------------------------- | -------------- |
| `bun run type-check`        | `tsc --noEmit` |
| `bun run lint` / `lint:fix` | `oxlint`       |
| `bun run fmt` / `fmt:check` | `oxfmt`        |
