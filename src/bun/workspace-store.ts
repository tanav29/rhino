import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Utils } from "electrobun/main";
import type { WorkspaceSnapshot } from "../shared/rpc-schema";

function storageFile(): string {
  try {
    return join(Utils.paths.userData, "workspace.json");
  } catch {
    return join(homedir(), ".term", "workspace.json");
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWorkspace: WorkspaceSnapshot | null = null;
const SAVE_DEBOUNCE_MS = 300;

export function loadWorkspace(): WorkspaceSnapshot | null {
  const file = storageFile();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as WorkspaceSnapshot;
    if (
      Array.isArray(parsed?.projects) &&
      typeof parsed.activeProjectId === "string" &&
      typeof parsed.activeSessionId === "string" &&
      Array.isArray(parsed.panes)
    ) {
      return parsed;
    }
  } catch {
    /* missing or corrupt file starts a clean workspace */
  }
  return null;
}

export function saveWorkspace(workspace: WorkspaceSnapshot) {
  pendingWorkspace = workspace;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushWorkspace, SAVE_DEBOUNCE_MS);
}

/** Synchronous and atomic so closing the last window cannot interrupt a save. */
export function flushWorkspace() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!pendingWorkspace) return;
  const file = storageFile();
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(pendingWorkspace, null, 2));
    renameSync(`${file}.tmp`, file);
    pendingWorkspace = null;
  } catch (error) {
    console.error("Unable to save workspace", error);
  }
}
