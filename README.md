# Rhino

Native desktop terminal — [wterm](https://wterm.dev) + [Ghostty](https://ghostty.org) rendering, [Bun.Terminal](https://bun.com/reference/bun/Terminal) PTYs, packaged with [Electrobun](https://blackboard.sh/electrobun/).

![Rhino icon](assets/logo.png)

## Marketing page

The standalone landing page lives in `marketing/` and does not connect to the terminal backend. The machine selector shows illustrative sessions; the Download button is a placeholder.

```bash
bun run dev:marketing   # http://127.0.0.1:4173
bun run build:marketing # static site in marketing/dist
```

Deploy on Vercel by importing the repository and setting the project root to `marketing`. Vercel can use the Vite framework preset and Bun lockfile. Run `bun install` in `marketing` before building locally.

## Features

- **Real shell** — PTYs via `Bun.Terminal` (ConPTY on Windows)
- **Multi-session tabs & split panes** — row/column splits with per-pane terminals
- **File tree** — project files with git-aware status
- **Git panel** — changed files + inline diffs (GitHub Dark, shiki)
- **Shell detection** — cmd / PowerShell / pwsh / git-bash / WSL / bash / zsh
- **Workspaces** — multiple projects, persisted under the app's `userData` dir

## Requirements

- [Bun](https://bun.sh) 1.4+
- Hutch — Electrobun's CLI. `Rhino` pins `electrobun@2.0.1` in `hutch.config.ts`.

```powershell
# Windows PowerShell
& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))
hutch --version
```

`bun run prepare:desktop` projects the devkit into `.hutch/devkit` (tsconfig paths + Vite aliases). Run it after installing dependencies on a fresh clone. The launcher also finds Hutch in `~/.hutch/bin` when it is not on PATH.

> **Windows + broken IPv6:** if `hutch electrobun prepare` fails with `ReleaseDownloadFailed` on a host that has IPv6 routes but no IPv6 egress, prefer IPv4:
>
> ```powershell
> netsh interface ipv6 set prefixpolicy ::ffff:0:0/96 50 0
> ```

## Run

```bash
bun install
bun run prepare:desktop

# HMR (Vite on :5173, app loads from http://localhost:5173)
bun run dev

# or without HMR (app loads bundled views://)
bun run dev:bundled
```

## Build installers

```bash
bun run build             # stable channel
bun run build:canary      # canary channel (separate install)
```

Builds type-check the app, bundle the webview and WASM, and package the native runtime. App bundles are written to `build/`; distributable installers and update bundles are written to `artifacts/`. Windows uses the multi-size icon at `assets/icon.ico`, configured in `electrobun.config.ts`.

Regenerate the Windows icon and shared app/marketing logo in `assets/` from `logo.png` with `bun scripts/make-icon.ts` on Windows.

Close a running development app before packaging: Hutch holds a project lock while it is running.

## Release

Set the same version in `package.json` and `electrobun.config.ts`, then commit and push the changes and a matching `vX.Y.Z` tag. The **Release Rhino** GitHub Actions workflow installs the pinned toolchain, runs lint and tests, and type-checks and builds installers for Windows x64, macOS Apple Silicon, and Linux x64/ARM64. After every build succeeds, it publishes a GitHub Release with generated notes and all files from `artifacts/`. Branch pushes do not publish releases.

```bash
git tag v0.0.1
git push origin main v0.0.1
```

The workflow also supports **Run workflow** with an existing version tag. Installers are currently unsigned. Publishing releases does not enable automatic updates in installed apps.

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

`vite.config.ts` trims shiki to common languages and `github-dark-default`, and loads panels and dialogs on demand. The webview build is about 9.4 MB, including Ghostty WASM and all four terminal font styles. The fonts use WOFF2 compression with their full Nerd Font glyph coverage; to convert a replacement TTF, run `bunx wawoff2 input.ttf output.woff2` and retain the font license.

UI components are checked in under `components/ui/`; run `bunx shadcn add <component>` when adding one. The app keeps the CSS state variants it uses in `src/mainview/globals.css`, so the CLI is not an install dependency.

Workspace layout and terminal preferences are saved atomically and flushed on app exit. Shell processes are new on relaunch; terminal scrollback is retained while the app is running. Exited shells and startup failures show a **Restart terminal** action. Closing the last tab creates a fresh terminal.

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

| Script                      | What it does                                    |
| --------------------------- | ----------------------------------------------- |
| `bun run type-check`        | `tsc --noEmit`                                  |
| `bun test ./tests`          | Native PTY, workspace and pane regression tests |
| `bun run lint` / `lint:fix` | `oxlint`                                        |
| `bun run fmt` / `fmt:check` | `oxfmt`                                         |
