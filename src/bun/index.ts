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
import { resolve } from "node:path";
import type { AppRPC } from "../shared/rpc-schema";
import { createBackendHandlers } from "./backend-handlers";
import { createBackendController } from "./backend-controller";
import {
  killAllSessions,
  killSession,
  resizePty,
  setSessionEventSink,
  writePtyInput,
} from "./sessions";
import { flushWorkspace, setWorkspaceDirectory } from "./workspace-store";
import { setWindowAppearance } from "./window-appearance";

const DEV_SERVER_URL = `http://localhost:${DEV_FRONTEND_PORT}`;
setWorkspaceDirectory(Utils.paths.userData);
const handlers = createBackendHandlers();
const bundledView = resolve(PATHS.VIEWS_FOLDER, "mainview");
const backend = createBackendController(
  handlers,
  existsSync(bundledView) ? bundledView : resolve("dist"),
);

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      ...handlers,
      getBackendStatus: () => backend.status(),
      configureBackend: (options) => backend.configure(options),
    },
    messages: {
      ptyInput: ({ sessionId, data }) => writePtyInput(sessionId, data),
      ptyResize: ({ sessionId, cols, rows }) => resizePty(sessionId, cols, rows),
      killSession: ({ sessionId }) => killSession(sessionId),
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
