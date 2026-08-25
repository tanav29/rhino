import type { RPCSchema } from "electrobun/view";

export interface ShellOption {
  name: string;
  value: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  error?: string;
}

export type FilePreview = { contents: string } | { error: string };

export type GitDiffResult =
  | { kind: "added"; contents: string }
  | { kind: "diff"; patch: string }
  | { kind: "empty" }
  | { error: string };

/** Serialized workspace layout persisted by the main process. */
export interface WorkspaceSnapshot {
  projects: unknown[];
  activeProjectId: string;
  activeSessionId: string;
  panes: unknown[];
  defaultShell?: string;
}

export interface AttachSessionParams {
  sessionId: string;
  shell?: string;
  cwd?: string;
  cols: number;
  rows: number;
}

export interface AttachSessionResult {
  title: string;
  /** Scrollback replay so re-attaching restores terminal history. */
  replay: string;
}

/**
 * Typed RPC contract between the Bun main process (`bun`) and the React
 * webview (`webview`).
 *
 * - `bun.requests` run in the main process, called from the webview.
 * - `bun.messages` are received by the main process, sent from the webview.
 * - `webview.messages` are received by the webview, sent from the main process.
 */
/**
 * Handler map implemented by the main process for `bun.requests`.
 * Mirrors Electrobun's optional-keyed RPCRequestHandlerObject shape.
 */
export type BunRequestHandlers = {
  [M in keyof AppRPC["bun"]["requests"]]?: (
    params: AppRPC["bun"]["requests"][M]["params"],
  ) =>
    | AppRPC["bun"]["requests"][M]["response"]
    | Promise<AppRPC["bun"]["requests"][M]["response"]>;
};

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      listShells: { params: {}; response: ShellOption[] };
      browseDirectory: { params: { path?: string }; response: DirectoryListing };
      listProjectFiles: { params: { cwd: string }; response: { paths: string[]; error?: string } };
      readFilePreview: { params: { cwd: string; path: string }; response: FilePreview };
      readGitStatus: { params: { cwd: string }; response: string };
      readGitDiff: { params: { cwd: string; path: string }; response: GitDiffResult };
      loadWorkspace: { params: {}; response: WorkspaceSnapshot | null };
      saveWorkspace: { params: { workspace: WorkspaceSnapshot }; response: null };
      attachSession: { params: AttachSessionParams; response: AttachSessionResult };
    };
    messages: {
      ptyInput: { sessionId: string; data: string };
      ptyResize: { sessionId: string; cols: number; rows: number };
      killSession: { sessionId: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      ptyOutput: { sessionId: string; data: string };
      ptyTitle: { sessionId: string; title: string };
      ptyExit: { sessionId: string };
    };
  }>;
};
