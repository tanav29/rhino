import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const MAX_LISTED_FILES = 20_000;

async function walkDirectory(
  root: string,
  prefix: string,
  ignored: Set<string>,
  results: string[],
): Promise<void> {
  if (results.length >= MAX_LISTED_FILES) return;
  let entries;
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (results.length >= MAX_LISTED_FILES || entry.name === ".git") return;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          await walkDirectory(root, relPath, ignored, results);
        }
      } else if (entry.isFile() && results.length < MAX_LISTED_FILES) {
        results.push(relPath);
      }
    }),
  );
}

/**
 * Lists project files, preferring git for speed and .gitignore compliance,
 * with a recursive filesystem walk as the non-repo fallback.
 */
export async function listProjectFiles(cwd: string, ignoredDirs: Set<string>): Promise<string[]> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, "ls-files", "-co", "--exclude-standard"], {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    const files = (result.stdout as string)
      .split("\n")
      .reduce<string[]>((acc, line) => {
        const t = line.trim();
        if (t) acc.push(t.replace(/\\/g, "/"));
        return acc;
      }, [])
      .slice(0, MAX_LISTED_FILES);
    if (files.length) return files;
  } catch {
    /* not a git repo */
  }
  const results: string[] = [];
  await walkDirectory(cwd, "", ignoredDirs, results);
  return results;
}
