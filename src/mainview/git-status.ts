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

/** Parses short status, including NUL-delimited paths that Git does not quote. */
export function parseGitStatus(raw: string): GitChangedFile[] {
  const files: GitChangedFile[] = [];
  const nulDelimited = raw.includes("\0");
  const lines = raw.split(nulDelimited ? "\0" : "\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line || line.startsWith("##")) continue;
    const code = line.slice(0, 2);
    let rest = line.slice(3);
    if (nulDelimited) {
      // In -z output the destination comes first, then the old path in its own field.
      if (/[RC]/.test(code)) index++;
    } else {
      const arrow = rest.indexOf(" -> ");
      if (arrow !== -1) rest = rest.slice(arrow + 4);
      rest = rest.replace(/^"(.*)"$/, "$1").trim();
    }
    const path = rest;
    if (!path) continue;
    files.push({ path, status: mapStatus(code), code });
  }
  return files;
}

export function toGitStatusEntries(files: GitChangedFile[]): GitStatusEntry[] {
  return files.map((f) => ({ path: f.path, status: f.status }));
}
