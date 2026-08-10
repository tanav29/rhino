import { Hono } from "hono";
import { dirname, join, resolve } from "path";
import { resolveWithinCwd, sessionsSnapshot, listProjectFiles } from "./sessions";
import { getAvailableShells } from "../utils/shells";
import { execFileAsync } from "../lib/server-commands";
import { readdir, readFile, stat } from "fs/promises";
import { MAX_PREVIEW_FILE_SIZE } from "./env";
import { getWorkspace, setWorkspace, type WorkspaceState } from "./workspace";

export const apiRouter = new Hono();

apiRouter.get("/sessions", (c) => {
  return c.json(sessionsSnapshot(), 200);
});

apiRouter.get("/workspace", (c) => c.json(getWorkspace(), 200));

apiRouter.put("/workspace", async (c) => {
  try {
    const body = (await c.req.json()) as Partial<WorkspaceState>;
    if (
      !Array.isArray(body.projects) ||
      typeof body.activeProjectId !== "string" ||
      typeof body.activeSessionId !== "string" ||
      !Array.isArray(body.panes)
    ) {
      return c.json({ error: "Invalid workspace" }, 400);
    }
    return c.json(
      setWorkspace({
        projects: body.projects,
        activeProjectId: body.activeProjectId,
        activeSessionId: body.activeSessionId,
        panes: body.panes,
        defaultShell: typeof body.defaultShell === "string" ? body.defaultShell : undefined,
      }),
      200,
    );
  } catch {
    return c.json({ error: "Invalid workspace" }, 400);
  }
});

apiRouter.get("/shells", (c) => {
  return c.json(getAvailableShells(), 200);
});

apiRouter.get("/browse", async (c) => {
  const requested = c.req.query("path")?.trim() ?? null;
  const home =
    process.platform === "win32" ? process.env.USERPROFILE || "C:\\" : process.env.HOME || "/";
  const resolved = resolve(requested || home);
  try {
    const dirents = await readdir(resolved, { withFileTypes: true });
    const entries = dirents
      .reduce<{ name: string; path: string }[]>((r, e) => {
        if (e.isDirectory() && !e.name.startsWith("."))
          r.push({ name: e.name, path: join(resolved, e.name) });
        return r;
      }, [])
      .sort((a, b) => a.name.localeCompare(b.name));
    const parent = dirname(resolved);
    return c.json({ path: resolved, parent: parent === resolved ? null : parent, entries }, 200);
  } catch (error) {
    return c.json(
      {
        path: resolved,
        parent: null,
        entries: [],
        error: error instanceof Error ? error.message : "Unable to read directory",
      },
      500,
    );
  }
});

apiRouter.get("/files", async (c) => {
  const cwd = resolve(c.req.query("cwd") || process.cwd());
  const paths = await listProjectFiles(cwd);
  return c.json({ paths }, 200);
});

apiRouter.get("/file", async (c) => {
  const cwd = resolve(c.req.query("cwd") || process.cwd());
  const path = c.req.query("path") || "";
  const resolved = resolveWithinCwd(cwd, path);
  if (!resolved) return c.json({ error: "Invalid path" }, 400);
  try {
    const stats = await stat(resolved);
    if (!stats.isFile()) throw new Error("Not a file");
    if (stats.size > MAX_PREVIEW_FILE_SIZE)
      return c.json({ error: "File is too large to preview" }, 400);
    const buffer = await readFile(resolved);
    if (buffer.subarray(0, 8000).includes(0))
      return c.json({ error: "Binary file cannot be previewed" }, 400);
    return c.json({ contents: buffer.toString("utf-8") }, 200);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unable to read file" }, 500);
  }
});

apiRouter.get("/git/status", async (c) => {
  const cwd = resolve(c.req.query("cwd") || process.cwd());
  try {
    const result = await execFileAsync("git", ["-C", cwd, "status", "--short", "--branch"], {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    return c.text(result.stdout, 200);
  } catch {
    return c.text("", 200);
  }
});

apiRouter.get("/git/diff", async (c) => {
  const cwd = resolve(c.req.query("cwd") || process.cwd());
  const path = c.req.query("path") || "";

  const resolved = resolveWithinCwd(cwd, path);
  if (!resolved) return c.json({ error: "Invalid path" }, 400);
  try {
    const statusResult = await execFileAsync(
      "git",
      ["-C", cwd, "status", "--porcelain=1", "--untracked-files=all", "--", path],
      { windowsHide: true },
    );
    const statusLine = statusResult.stdout.split("\n").find(Boolean) ?? "";
    if (statusLine.startsWith("??")) {
      const contents = await readFile(resolved, "utf-8");
      return c.json({ kind: "added", contents }, 200);
    }
    let patch = "";
    for (const args of [
      ["diff", "HEAD", "--", path],
      ["diff", "--cached", "--", path],
      ["diff", "--", path],
    ]) {
      try {
        const result = await execFileAsync("git", ["-C", cwd, ...args], {
          windowsHide: true,
          maxBuffer: 20 * 1024 * 1024,
        });
        if (result.stdout.trim()) {
          patch = result.stdout;
          break;
        }
      } catch {}
    }
    if (!patch) return c.json({ kind: "empty" }, 200);
    return c.json({ kind: "diff", patch }, 200);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unable to diff file" }, 500);
  }
});
