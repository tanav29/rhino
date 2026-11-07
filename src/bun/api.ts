import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { BunRequestHandlers } from "../shared/rpc-schema";
import { getAvailableShells } from "./shells";
import { listProjectFiles } from "./files";

const execFileAsync = promisify(execFile);
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "target",
  "venv",
  ".venv",
  "__pycache__",
  ".cache",
  "coverage",
]);

function homeDirectory() {
  return process.platform === "win32" ? process.env.USERPROFILE || "C:\\" : process.env.HOME || "/";
}

export function resolveWithinCwd(cwd: string, relPath: string): string | null {
  const resolved = resolve(cwd, relPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return resolved;
}

type RequestHandlers = BunRequestHandlers;

/** Typed RPC handlers for everything the webview used to fetch over HTTP. */
export function createApiHandlers(): RequestHandlers {
  return {
    listShells: () => getAvailableShells(),

    browseDirectory: async ({ path }) => {
      const resolved = resolve(path?.trim() || homeDirectory());
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
        return { path: resolved, parent: parent === resolved ? null : parent, entries };
      } catch (error) {
        return {
          path: resolved,
          parent: null,
          entries: [],
          error: error instanceof Error ? error.message : "Unable to read directory",
        };
      }
    },

    listProjectFiles: async ({ cwd }) => {
      const root = resolve(cwd || process.cwd());
      try {
        return { paths: await listProjectFiles(root, IGNORED_DIR_NAMES) };
      } catch (error) {
        return {
          paths: [],
          error: error instanceof Error ? error.message : "Unable to list files",
        };
      }
    },

    readGitStatus: async ({ cwd }) => {
      const root = resolve(cwd || process.cwd());
      try {
        const result = await execFileAsync("git", ["-C", root, "status", "--short", "--branch"], {
          windowsHide: true,
          maxBuffer: 20 * 1024 * 1024,
        });
        return result.stdout as string;
      } catch {
        return "";
      }
    },

    readGitDiff: async ({ cwd, path }) => {
      const root = resolve(cwd || process.cwd());
      const target = resolveWithinCwd(root, path);
      if (!target) return { error: "Invalid path" };
      try {
        const statusResult = await execFileAsync(
          "git",
          ["-C", root, "status", "--porcelain=1", "--untracked-files=all", "--", path],
          { windowsHide: true },
        );
        const statusLine = (statusResult.stdout as string).split("\n").find(Boolean) ?? "";
        if (statusLine.startsWith("??")) {
          const contents = await readFile(target, "utf-8");
          return { kind: "added", contents };
        }
        for (const args of [
          ["diff", "HEAD", "--", path],
          ["diff", "--cached", "--", path],
          ["diff", "--", path],
        ]) {
          try {
            const result = await execFileAsync("git", ["-C", root, ...args], {
              windowsHide: true,
              maxBuffer: 20 * 1024 * 1024,
            });
            if ((result.stdout as string).trim()) return { kind: "diff", patch: result.stdout };
          } catch {}
        }
        return { kind: "empty" };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Unable to diff file" };
      }
    },
  };
}
