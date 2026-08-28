import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const file = storageFile();
    const data = JSON.stringify(workspace, null, 2);
    try {
      // Use Bun.write when running under Bun (preferred), fallback to node:fs
      const bunWrite = (
        globalThis as unknown as {
          Bun?: { write: (path: string, data: string) => Promise<unknown> };
        }
      )?.Bun?.write;
      if (bunWrite) {
        mkdirSync(dirname(file), { recursive: true });
        void bunWrite(file, data).catch(() => writeFileSync(file, data));
      } else {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, data);
      }
    } catch {
      /* persistence is best-effort */
    }
  }, SAVE_DEBOUNCE_MS);
}
