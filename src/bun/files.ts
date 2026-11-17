import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const MAX_LISTED_FILES = 20_000;
const WALK_CONCURRENCY = 16;

async function walkDirectory(root: string, ignored: Set<string>): Promise<string[]> {
  const results: string[] = [];
  const directories = [""];
  for (let index = 0; index < directories.length && results.length < MAX_LISTED_FILES;) {
    const batch = directories.slice(index, index + WALK_CONCURRENCY);
    index += batch.length;
    await Promise.all(
      batch.map(async (prefix) => {
        let entries;
        try {
          entries = await readdir(join(root, prefix), { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (results.length >= MAX_LISTED_FILES) break;
          if (entry.name === ".git") continue;
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (!ignored.has(entry.name)) directories.push(relPath);
          } else if (entry.isFile()) results.push(relPath);
        }
      }),
    );
  }
  return results;
}

/**
 * Lists project files, preferring git for speed and .gitignore compliance,
 * with a recursive filesystem walk as the non-repo fallback.
 */
export async function listProjectFiles(cwd: string, ignoredDirs: Set<string>): Promise<string[]> {
  try {
    const result = await execFileAsync(
      "git",
      ["-C", cwd, "ls-files", "-z", "--deduplicate", "-co", "--exclude-standard"],
      {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    return (result.stdout as string).split("\0").filter(Boolean).slice(0, MAX_LISTED_FILES);
  } catch {
    /* not a git repo */
  }
  return walkDirectory(cwd, ignoredDirs);
}
