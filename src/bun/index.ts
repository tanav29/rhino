import { DEV_FRONTEND_PORT } from "../shared/ports";
import {
  app,
  BrowserView,
  BrowserWindow,
  BuildConfig,
  Updater,
  PATHS,
  Utils,
} from "electrobun/main";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { AppRPC } from "../shared/rpc-schema";
import { createBackendHandlers } from "./backend-handlers";
import { createBackendController } from "./backend-controller";
import {
  killAllSessions,
  getSessionDirectory,
  getSessionTitle,
  killSession,
  resizePty,
  setSessionEventSink,
  writePtyInput,
} from "./sessions";
import { flushWorkspace, setWorkspaceDirectory } from "./workspace-store";
import { setWindowAppearance } from "./window-appearance";
import { resolveTerminalLink } from "./terminal-links";
import { LONG_COMMAND_MS } from "./terminal-metadata";

const DEV_SERVER_URL = `http://localhost:${DEV_FRONTEND_PORT}`;
setWorkspaceDirectory(Utils.paths.userData);
const handlers = createBackendHandlers();
const bundledView = resolve(PATHS.VIEWS_FOLDER, "mainview");
const backend = createBackendController(
  handlers,
  existsSync(bundledView) ? bundledView : resolve("dist"),
);
let focusedSessionId: string | null = null;

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      ...handlers,
      getBackendStatus: () => backend.status(),
      setInternetSharing: (options) => backend.setInternetSharing(options),
      copyBackendShareLink: () => {
        const link = backend.status().internet.url;
        if (!link) throw new Error("Create a public link first");
        Utils.clipboardWriteText(link);
        return null;
      },
      configureBackend: (options) => backend.configure(options),
      openTerminalLink: async ({ sessionId, target }) => {
        let link = resolveTerminalLink(target, process.cwd());
        if (link.kind === "url") {
          if (!Utils.openExternal(link.value)) throw new Error("Unable to open link");
        } else {
          const directory = getSessionDirectory(sessionId);
          const cwd = directory.uri
            ? resolveTerminalLink(directory.uri, directory.cwd)
            : { kind: "path", value: directory.cwd };
          if (cwd.kind !== "path") throw new Error("Invalid terminal working directory");
          link = resolveTerminalLink(target, cwd.value);
          const info = await stat(link.value);
          if (info.isDirectory()) {
            if (!Utils.openPath(link.value)) throw new Error("Unable to open directory");
          } else {
            // Reveal files rather than executing a shell script or binary from output.
            Utils.showItemInFolder(link.value);
          }
        }
        return null;
      },
    },
    messages: {
      ptyInput: ({ sessionId, data }) => writePtyInput(sessionId, data),
      ptyResize: ({ sessionId, cols, rows }) => resizePty(sessionId, cols, rows),
      killSession: ({ sessionId }) => killSession(sessionId),
      focusedSession: ({ sessionId }) => {
        focusedSessionId = sessionId;
      },
    },
  },
});

setSessionEventSink((event) => {
  switch (event.kind) {
    case "output":
      rpc.send.ptyOutput({ sessionId: event.sessionId, data: event.data });
      break;
    case "title":
      rpc.send.ptyTitle({ sessionId: event.sessionId, title: event.title });
      break;
    case "exit":
      rpc.send.ptyExit({ sessionId: event.sessionId });
      break;
    case "commandFinished":
      if (event.durationMs >= LONG_COMMAND_MS && event.sessionId !== focusedSessionId) {
        Utils.showNotification({
          title:
            event.exitCode === null || event.exitCode === 0 ? "Command finished" : "Command failed",
          body: `${getSessionTitle(event.sessionId)}: ${event.exitCode === null ? "finished" : `exit ${event.exitCode}`} after ${Math.round(event.durationMs / 1000)}s`,
          silent: true,
        });
      }
      break;
  }
});

// In dev builds, prefer a running Vite server so the webview gets HMR.
async function resolveMainViewUrl(): Promise<string> {
  try {
    const channel = await Updater.localInfo.channel();
    if (channel === "dev") {
      try {
        const response = await fetch(DEV_SERVER_URL, {
          method: "HEAD",
          signal: AbortSignal.timeout(1500),
        });
        if (!response.ok) throw new Error("Vite server unavailable");
        console.log(`HMR enabled: using Vite dev server at ${DEV_SERVER_URL}`);
        return DEV_SERVER_URL;
      } catch {
        console.log("Vite dev server not running; loading bundled views.");
      }
    }
  } catch {
    /* channel info is unavailable outside packaged builds */
  }
  return "views://mainview/index.html";
}

const cleanup = () => {
  backend.stop();
  flushWorkspace();
  killAllSessions();
};
app.on("before-quit", cleanup);
process.on("exit", cleanup);

const url = await resolveMainViewUrl();
const isDevWindow = BuildConfig.getSync().buildEnvironment === "dev";

const window = new BrowserWindow({
  title: isDevWindow ? "Rhino — DEV" : "Rhino",
  url,
  rpc,
  frame: {
    width: 1280,
    height: 800,
  },
});
setWindowAppearance(window);
