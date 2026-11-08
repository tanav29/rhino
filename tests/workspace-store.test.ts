import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "term-workspace-test-"));
const { flushWorkspace, loadWorkspace, saveWorkspace, setWorkspaceDirectory } =
  await import("../src/bun/workspace-store");
setWorkspaceDirectory(directory);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("shutdown flush writes the latest pending workspace", () => {
  const snapshot = {
    projects: [],
    activeProjectId: "first",
    activeSessionId: "session",
    panes: [],
    sidebarCollapsed: true,
  };
  saveWorkspace(snapshot);
  saveWorkspace({ ...snapshot, activeProjectId: "latest" });
  expect(loadWorkspace()?.activeProjectId).toBe("latest");
  flushWorkspace();
  expect(loadWorkspace()?.activeProjectId).toBe("latest");
  expect(JSON.parse(readFileSync(join(directory, "workspace.json"), "utf8")).activeProjectId).toBe(
    "latest",
  );
  expect(loadWorkspace()?.sidebarCollapsed).toBe(true);
});
