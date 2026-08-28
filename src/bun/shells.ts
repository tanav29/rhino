import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import type { ShellOption } from "../shared/rpc-schema";

interface AvailableShell extends ShellOption {
  args: string[];
}

/** Resolves a command on PATH via `where`, returning its path or null. */
function which(cmd: string): string | null {
  try {
    const line = execSync(`where ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    return line || null;
  } catch {
    return null;
  }
}

function getWindowsShells(): AvailableShell[] {
  const shells: AvailableShell[] = [];

  // Always available on Windows.
  shells.push({ name: "Command Prompt", value: "cmd.exe", args: ["/k"] });
  shells.push({ name: "PowerShell", value: "powershell.exe", args: [] });

  // PowerShell 7+ — an independent probe (formerly gated behind the pwsh check
  // succeeding, which silently hid Git Bash when pwsh was absent).
  if (which("pwsh.exe")) shells.push({ name: "PowerShell 7+", value: "pwsh.exe", args: [] });

  // Git Bash: bash.exe is the embeddable shell. git-bash.exe launches its own
  // MinTTY window and cannot be hosted inside a PTY, so resolve bash.exe from
  // the Git installation (via `where git`) or the standard install locations.
  const git = which("git.exe");
  const gitRoot = git ? dirname(dirname(git)) : null;
  const bash =
    [
      gitRoot && join(gitRoot, "bin", "bash.exe"),
      gitRoot && join(gitRoot, "usr", "bin", "bash.exe"),
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ].find((p): p is string => Boolean(p) && existsSync(p as string)) ?? which("bash.exe");
  if (bash) shells.push({ name: "Git Bash", value: bash, args: ["--login", "-i"] });

  // WSL default distribution, if installed.
  if (which("wsl.exe")) shells.push({ name: "WSL", value: "wsl.exe", args: [] });

  return shells;
}

export function getAvailableShells(): AvailableShell[] {
  if (os.platform() === "win32") return getWindowsShells();
  return [
    { name: "Bash", value: "/bin/bash", args: [] },
    { name: "Zsh", value: "/bin/zsh", args: [] },
  ];
}
