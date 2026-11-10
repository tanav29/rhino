import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiHandlers } from "../src/bun/api";
import { parseGitStatus } from "../src/mainview/git-status";

const directory = mkdtempSync(join(tmpdir(), "term-path-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

async function git(...args: string[]) {
  const proc = Bun.spawn(["git", "-C", directory, ...args], { stdout: "pipe", stderr: "pipe" });
  const error = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new Error(error);
}

test("files, status and diffs share paths relative to the terminal subdirectory", async () => {
  const cwd = join(directory, "nested folder");
  mkdirSync(cwd);
  await git("init");
  // A user-level setting must not change the path basis used by the panels.
  await git("config", "status.relativePaths", "false");
  writeFileSync(join(directory, "outside.txt"), "outside\n");
  writeFileSync(join(cwd, "tracked.txt"), "before\n");
  await git("add", ".");
  await git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
  writeFileSync(join(directory, "outside.txt"), "outside change\n");
  writeFileSync(join(cwd, "tracked.txt"), "after\n");
  mkdirSync(join(cwd, "new"));
  writeFileSync(join(cwd, "new", "untracked.txt"), "new file\n");

  const api = createApiHandlers();
  const files = await api.listProjectFiles!({ cwd });
  expect(files.paths.sort()).toEqual(["new/untracked.txt", "tracked.txt"]);
  const status = parseGitStatus(await api.readGitStatus!({ cwd }));
  expect(status.map((file) => file.path).sort()).toEqual(files.paths);
  expect(await api.readGitDiff!({ cwd, path: "new/untracked.txt" })).toEqual({
    kind: "added",
    contents: "new file\n",
  });
  expect(await api.readGitDiff!({ cwd, path: "tracked.txt" })).toMatchObject({
    kind: "diff",
    patch: expect.stringContaining("+after"),
  });
});
