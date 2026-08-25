import { execSync } from "node:child_process";
import os from "node:os";
import type { ShellOption } from "../shared/rpc-schema";

interface AvailableShell extends ShellOption {
  args: string[];
}

export function getAvailableShells(): AvailableShell[] {
  const shells: AvailableShell[] = [];

  if (os.platform() === "win32") {
    // Always available on Windows
    shells.push({ name: "Command Prompt", value: "cmd.exe", args: ["/k"] });
    shells.push({ name: "PowerShell", value: "powershell.exe", args: [] });

    try {
      execSync("where pwsh.exe", { stdio: "ignore" });
      shells.push({ name: "PowerShell 7+", value: "pwsh.exe", args: [] });
      execSync("where git-bash.exe", { stdio: "ignore" });
      shells.push({ name: "Git Bash", value: "git-bash.exe", args: [] });
    } catch {}

    // WSL (if installed)
    try {
      execSync("where wsl.exe", { stdio: "ignore" });
      shells.push({ name: "WSL (Ubuntu)", value: "wsl.exe", args: ["-d", "Ubuntu"] });
    } catch {}
  } else {
    // macOS / Linux
    shells.push({ name: "Bash", value: "/bin/bash", args: [] });
    shells.push({ name: "Zsh", value: "/bin/zsh", args: [] });
  }

  return shells;
}
