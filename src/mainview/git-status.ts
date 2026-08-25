import type { GitStatus, GitStatusEntry } from "@pierre/trees";

export interface GitChangedFile {
  path: string;
  status: GitStatus;
  code: string;
}

function mapStatus(code: string): GitStatus {
  if (code.includes("?")) return "untracked";
  if (code.includes("R")) return "renamed";
  if (code.includes("A")) return "added";
  if (code.includes("D")) return "deleted";
  return "modified";
}

/** Parses the output of `git status --short --branch` into changed files. */
export function parseGitStatus(raw: string): GitChangedFile[] {
  const files: GitChangedFile[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith("##")) continue;
    const code = line.slice(0, 2);
    let rest = line.slice(3);
    const arrow = rest.indexOf(" -> ");
    if (arrow !== -1) rest = rest.slice(arrow + 4);
    const path = rest.replace(/^"(.*)"$/, "$1").trim();
    if (!path) continue;
    files.push({ path, status: mapStatus(code), code });
  }
  return files;
}

export function toGitStatusEntries(files: GitChangedFile[]): GitStatusEntry[] {
  return files.map((f) => ({ path: f.path, status: f.status }));
}
