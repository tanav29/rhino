import { app, BrowserView, BrowserWindow, BuildConfig, Updater } from "electrobun/main";
import type { AppRPC } from "../shared/rpc-schema";
import { createApiHandlers } from "./api";
import {
  attachSession,
  killAllSessions,
  killSession,
  listAgents,
  resizePty,
  setSessionEventSink,
  writePtyInput,
} from "./sessions";
import { flushWorkspace, loadWorkspace, saveWorkspace } from "./workspace-store";
import { setWindowAppearance } from "./window-appearance";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      ...createApiHandlers(),
      listAgents: () => listAgents(),
      loadWorkspace: () => loadWorkspace(),
      saveWorkspace: ({ workspace }) => {
        saveWorkspace(workspace);
        return null;
      },
      attachSession: (params) => {
        console.log(
          `[pty] attach ${params.sessionId} shell=${params.shell ?? "default"} cwd=${params.cwd ?? "~"}`,
        );
        return attachSession(params);
      },
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
