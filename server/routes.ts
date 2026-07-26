import { Hono } from "hono";
import { resolve } from "path";
import { sessionsSnapshot, isDevMode } from "./sessions";
import { getAvailableShells } from "../utils/shells";
import {
  handleFileBrowse,
  handleGitStatus,
  handleListFiles,
  handleReadFile,
  handleGitDiff,
} from "./sessions";

export const apiRouter = new Hono();

apiRouter.get("/sessions", (c) => {
  const dev = isDevMode();
  return c.json(sessionsSnapshot(), 200);
});

apiRouter.get("/shells", (c) => {
  const dev = isDevMode();
  return c.json(getAvailableShells(), 200);
});

apiRouter.get("/browse", async (c) => {
  const requested = c.req.query("path")?.trim() ?? null;
  return c.json(await handleFileBrowse(requested), 200);
});

apiRouter.get("/files", async (c) => {
  const cwd = resolve(c.req.query("cwd") || process.cwd());
  try {
    return c.json(await handleListFiles(cwd), 200);
  } catch (e) {
    return c.json(
      { paths: [], error: e instanceof Error ? e.message : "Unable to list files" },
      200
    );
  }
});

apiRouter.get("/file", async (c) => {
  const cwd = resolve(c.req.query("cwd") || process.cwd());
  const result = await handleReadFile(cwd, c.req.query("path") || "");
  return c.json(result, 200);
});

apiRouter.get("/git/diff", async (c) => {
  const cwd = resolve(c.req.query("cwd") || process.cwd());
  const result = await handleGitDiff(cwd, c.req.query("path") || "");
  return c.json(result, 200);
});
