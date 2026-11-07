import { afterAll, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "term-workspace-test-"));
mock.module("electrobun/main", () => ({ Utils: { paths: { userData: directory } } }));
const { flushWorkspace, loadWorkspace, saveWorkspace } = await import("../src/bun/workspace-store");
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("shutdown flush writes the latest pending workspace", () => {
  const snapshot = {
    projects: [],
    activeProjectId: "first",
    activeSessionId: "session",
    panes: [],
  };
  saveWorkspace(snapshot);
  saveWorkspace({ ...snapshot, activeProjectId: "latest" });
  flushWorkspace();
  expect(loadWorkspace()?.activeProjectId).toBe("latest");
  expect(JSON.parse(readFileSync(join(directory, "workspace.json"), "utf8")).activeProjectId).toBe(
    "latest",
  );
});
