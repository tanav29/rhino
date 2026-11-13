# Rhino

Native desktop terminal — [wterm](https://wterm.dev) + [Ghostty](https://ghostty.org) rendering, [Bun.Terminal](https://bun.com/reference/bun/Terminal) PTYs, packaged with [Electrobun](https://blackboard.sh/electrobun/).

![Rhino icon](assets/logo.png)

## Marketing page

The standalone landing page lives in `marketing/` and does not connect to the terminal backend. The machine selector shows illustrative sessions; the Download button links to GitHub releases.

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
- **Fast, compact interface** ? a minimal workspace with panels and dialogs loaded on demand
- **Network terminals** — share a backend on your LAN or control another machine with its URL and six-digit PIN
- **Internet sharing** — create a Cloudflare public link and switch between local and shared machines from the menu on the right
- **Smart selection** — double-click paths, URLs, IP addresses, git hashes and numbers, including soft-wrapped output
- **Clickable output** — Ctrl-click (Cmd-click on macOS) URLs, OSC 8 links and local file paths; files are revealed in the file manager and directories open normally
- **Agent status** — agent tabs show working / idle activity estimates, with exact blocked / needs attention states available through agent hooks
- **Command notifications** — native desktop alerts for commands lasting at least 10 seconds when their terminal is in the background; requires OSC 133 shell integration

## Shell and agent integration

Files and Git follow the selected terminal's directory. To update them after `cd`, enable shell integration, which also provides completion notifications and relative file links. If your prompt already emits OSC 133 command markers and OSC 7 working-directory URIs, no extra setup is needed. Otherwise source the matching script from this checkout in your shell profile (replace the path with your checkout's absolute path):

```powershell
# PowerShell: add to $PROFILE, after setting up your prompt. Requires PSReadLine.
. 'C:\path\to\term\scripts\shell-integration.ps1'
```

```bash
# Bash 4.4+: add to ~/.bashrc, after setting up your prompt
source /path/to/term/scripts/shell-integration.bash
# Zsh: add to ~/.zshrc instead
source /path/to/term/scripts/shell-integration.zsh
```

Restart the shell after changing its profile. Notifications are local desktop only and depend on OS notification settings. Plain cmd, SSH and WSL sessions need their own OSC 133 integration; quiet output alone never triggers a completion alert. Without OSC 7, Files, Git and relative file links use the session's initial directory. Files and Git are unavailable for explicitly remote shells (SSH/WSL). File links from network backends and explicitly remote shells are not opened on the local machine. A `:line:column` suffix is accepted when revealing a file.

Agent process detection runs every five seconds. **Inferred** status reflects recent terminal activity, so a quiet agent may still be working. To report exact status, an agent hook can emit `OSC 777;rhino;agent;<name>;<status> ST`, where status is `working`, `blocked`, `idle` or `needs-attention`. For example:

```bash
printf '\033]777;rhino;agent;codex;needs-attention\033\\'
```

```powershell
[Console]::Write("$([char]27)]777;rhino;agent;codex;needs-attention$([char]7)")
```

Both BEL and ST terminators are accepted. Input resumes activity-based status; OSC 133 completion clears the agent report. MCP control is tracked in https://github.com/tanav29/rhino/issues/3.

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

# HMR (Vite on :43187, app loads from http://localhost:43187)
bun run dev

# or without HMR (app loads bundled views://)
bun run dev:bundled
```

## Use terminals over your network

### Share over the internet

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) on the host and make sure it is on `PATH`, then restart Rhino. No Cloudflare account or domain is needed.

1. Click the **machine button on the right → Share this machine → Create public link**.
2. Copy the complete `https://….trycloudflare.com#token=…` link and reveal the six-digit PIN. Share both with someone you trust: they grant full terminal access.
3. In the other Rhino app, click **machine button → Add a machine**, paste the complete link, enter the PIN, and optionally name the machine. The link also opens Rhino's web interface in a browser.
4. Use the same menu to switch between **This machine** and any connected backend. Connections and shell processes stay alive while switching. **Manage machines** removes saved addresses and disconnects this app without killing the host's terminals.

Only machine names and backend addresses are remembered. PINs and link tokens stay in memory; after restarting or losing a connection, paste the complete link and PIN again. The desktop app starts on its local backend.

Internet sharing uses a separate token-protected loopback listener and Cloudflare's HTTPS/WSS tunnel; LAN sharing can remain off. **Stop sharing**, changing backend settings, regenerating the PIN, or quitting Rhino revokes the public connection. Sharing is off after an app restart. Each start generates a fresh link and access token. Cloudflare Quick Tunnels have temporary hostnames and no uptime guarantee; see [Cloudflare's Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

### Share on your LAN

On the host machine, open **Settings → Share this machine**, enable **network sharing**, choose a port (default `43188`), and click **Apply**. Click **Show** to reveal the six-digit PIN. Keep the host app running.

On another device on the same network, open one of the displayed `http://<host-ip>:43188` addresses in a browser and enter the PIN. Or, in another Rhino app, open **machine button → Add a machine**, enter the backend URL and PIN, and click **Connect**. The terminals, shells, files, Git data, and workspace come from the selected machine. **This machine** switches the desktop app back to its local backend.

The backend starts on loopback only; LAN sharing must be enabled again after restarting the desktop app. **New PIN** disconnects remote clients immediately. Clients remember the backend URL, but never save the PIN. Failed PIN attempts are limited per address and across the server. Changing ports or turning sharing off also disconnects remote clients, while their shell processes remain running on the host.

The PIN grants full terminal access. Use LAN addresses on a trusted network: HTTP/WebSocket traffic is not encrypted. For internet access, use the public-link flow above. If Windows prompts, allow the host app through the firewall on your private network.

To run a backend without the desktop window:

```powershell
bun run build:web
$env:TERM_HOST = "0.0.0.0"
$env:TERM_PORT = "43188"
bun run start:backend
```

The server prints a generated six-digit PIN. `TERM_PIN` can supply a specific six-digit PIN instead. Without `TERM_HOST`, it listens on `127.0.0.1`. The standalone backend saves its workspace to `~/.term/workspace.json`; the desktop app continues to use its `userData` directory. `bun run dev:web` uses the same PIN-protected backend with Vite and prints its PIN in the terminal.

## Build installers

```bash
bun run build             # stable channel
bun run build:canary      # canary channel (separate install)
```

Builds type-check the app, bundle the webview and WASM, and package the native runtime. The desktop window loads its built HTML, JavaScript, and CSS through `views://`; it does not require a frontend server. The backend listens on its configured port; internet sharing additionally starts a separate loopback listener for the tunnel. App bundles are written to `build/`; distributable installers and update bundles are written to `artifacts/`. Windows uses the multi-size icon at `assets/icon.ico`, configured in `electrobun.config.ts`.

Regenerate the Windows icon and shared app/marketing logo in `assets/` from `logo.png` with `bun scripts/make-icon.ts` on Windows.

Close a running development app before packaging: Hutch holds a project lock while it is running.

## Release

Set the same version in `package.json` and `electrobun.config.ts`, then commit and push the changes and a matching `vX.Y.Z` tag. The **Release Rhino** GitHub Actions workflow installs the pinned toolchain, runs lint and tests, and type-checks and builds installers for Windows x64, macOS Apple Silicon, and Linux x64/ARM64. It publishes a GitHub Release with generated notes and files from each successful target's `artifacts/`, even if another target fails. Only a fully successful build is marked as the latest release. Failed jobs still fail the workflow; re-running them adds the missing targets to the existing release. Branch pushes do not publish releases.

```bash
git tag v0.0.1
git push origin main v0.0.1
```

The workflow also supports **Run workflow** with an existing version tag and updates its release assets on retries. It always builds the tagged source, so source fixes must be included in a new version tag to take effect. Installers are currently unsigned. Publishing releases does not enable automatic updates in installed apps.

To retry a tag using the current workflow, select the `main` branch and enter the tag, or run:

```bash
gh workflow run release.yml --ref main -f tag=v0.0.1
```

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
| `bun run start:backend`     | PIN-protected terminal backend                  |
| `bun run build:web`         | Build the browser interface into `dist/`        |
| `bun test ./tests`          | Native PTY, workspace and pane regression tests |
| `bun run lint` / `lint:fix` | `oxlint`                                        |
| `bun run fmt` / `fmt:check` | `oxfmt`                                         |
