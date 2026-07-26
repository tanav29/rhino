# wterm

Full local terminal in the browser, connected to your machine's shell via WebSocket and [node-pty](https://github.com/microsoft/node-pty).

## Features

- **Real shell** — spawns actual PTY processes via node-pty
- **Multi-session tabs** — open multiple terminals side by side
- **Split panes** — split right or down with independent sessions
- **Command palette** — `⌘P` / `Ctrl+P` for quick actions
- **File tree** — browse project files with syntax-highlighted previews
- **Git panel** — view changed files and inline diffs
- **Shell detection** — auto-detects available shells (bash, zsh, cmd, PowerShell, WSL, git-bash)
- **SSH support** — connect to remote hosts via `ssh:host` shell value
- **Auto-reconnect** — exponential backoff on WebSocket disconnect
- **Workspaces** — multiple projects with localStorage persistence
- **Dark mode** — default dark theme

## Run as a package

```bash
npx @10xdevs/term
npx @10xdevs/term --port 8080
```

The default port is `4242`. Builds once on first run if no production build exists.

## Setup

```bash
bun install
bun run dev
```

Opens at `http://localhost:5173` (Vite dev server) with the backend on `http://localhost:4242`.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘T` / `Ctrl+T` | New terminal |
| `⌘D` / `Ctrl+D` | Split right |
| `⌘⇧D` / `Ctrl+Shift+D` | Split down |
| `⌘N` / `Ctrl+N` | New workspace |
| `⌘P` / `Ctrl+P` | Command palette |
| `⌘1-9` / `Ctrl+1-9` | Switch workspace |
| `⌘⇧F` / `Ctrl+Shift+F` | Files panel |
| `⌘⇧G` / `Ctrl+Shift+G` | Git panel |

## How It Works

- `server/` runs an HTTP + WebSocket server with Hono
- On WebSocket connection, a PTY process is spawned with your default shell
- The browser sends keystrokes over WebSocket; the server relays PTY output back
- Terminal resizing is forwarded to the PTY via a custom escape sequence

## Key Files

| File | Description |
| --- | --- |
| `server/index.ts` | Hono HTTP + WebSocket server entry |
| `server/routes.ts` | API routes: sessions, shells, browse, files, git |
| `server/sessions.ts` | PTY session management and WebSocket handling |
| `server/websocket.ts` | WebSocket upgrade handler |
| `src/App.tsx` | Main React app with workspace/session management |
| `src/session-view.tsx` | xterm.js terminal wrapper with auto-reconnect |
| `src/session-tabs.tsx` | Tab bar with shell icons and panel toggles |
| `src/file-tree-panel.tsx` | File browser with syntax-highlighted preview |
| `src/git-panel.tsx` | Git status and diff viewer |
| `src/command-palette.tsx` | Command palette UI |
| `utils/shells.ts` | Shell detection utilities |
| `bin/term.mjs` | Production entrypoint for `npx` |
