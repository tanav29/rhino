import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiHandlers } from "../src/bun/api";
import { parseGitStatus } from "../src/mainview/git-status";
import { listProjectFiles } from "../src/bun/files";

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

test("file and status paths preserve Unicode and spaces", async () => {
  const cwd = join(directory, "special-paths");
  mkdirSync(cwd);
  const paths = ["caf\u00e9.txt", "file with spaces.txt", " spaced .txt"];
  for (const path of paths) writeFileSync(join(cwd, path), "contents\n");
  await git("add", "special-paths");
  const api = createApiHandlers();
  expect((await api.listProjectFiles!({ cwd })).paths.sort()).toEqual(paths.toSorted());
  expect(
    parseGitStatus(await api.readGitStatus!({ cwd }))
      .map((file) => file.path)
      .sort(),
  ).toEqual(paths.toSorted());
  await git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    "Special paths",
  );
  await git("mv", "special-paths/caf\u00e9.txt", "special-paths/renamed.txt");
  for (const path of paths.slice(1)) writeFileSync(join(cwd, path), "changed\n");
  expect(
    parseGitStatus(await api.readGitStatus!({ cwd }))
      .map((file) => file.path)
      .sort(),
  ).toEqual(["renamed.txt", ...paths.slice(1)].sort());
});

test("NUL status parses renames without treating the original path as another entry", () => {
  expect(parseGitStatus("## main\0R  new -> name.txt\0old.txt\0?? caf\u00e9.txt\0")).toEqual([
    { path: "new -> name.txt", code: "R ", status: "renamed" },
    { path: "caf\u00e9.txt", code: "??", status: "untracked" },
  ]);
});

test("an empty Git listing stays empty instead of walking ignored directories", async () => {
  const cwd = join(directory, "ignored-only");
  mkdirSync(cwd);
  await git("init", cwd);
  writeFileSync(join(cwd, ".gitignore"), "*\n");
  writeFileSync(join(cwd, "private.txt"), "ignored\n");
  expect(await listProjectFiles(cwd, new Set())).toEqual([]);
});

test("non-repository listing traverses batches of directories and skips ignored trees", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "term-walk-test-"));
  try {
    for (let index = 0; index < 40; index++) {
      mkdirSync(join(cwd, String(index), "nested"), { recursive: true });
      writeFileSync(join(cwd, String(index), "nested", "file.txt"), "test");
    }
    mkdirSync(join(cwd, "node_modules"));
    writeFileSync(join(cwd, "node_modules", "ignored.txt"), "ignored");
    const paths = await listProjectFiles(cwd, new Set(["node_modules"]));
    expect(paths).toHaveLength(40);
    expect(paths).toContain("39/nested/file.txt");
    expect(paths.every((path) => !path.includes("node_modules"))).toBe(true);
    await expect(createApiHandlers().readGitStatus!({ cwd })).rejects.toThrow("Git unavailable");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
