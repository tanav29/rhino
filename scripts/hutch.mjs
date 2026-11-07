import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

const hutchBin = join(homedir(), ".hutch", "bin");
const hutchExe = join(hutchBin, process.platform === "win32" ? "hutch.exe" : "hutch");
if (!process.env.PATH?.includes(hutchBin)) {
  process.env.PATH = hutchBin + delimiter + (process.env.PATH ?? "");
}
if (process.platform === "win32") {
  const sys32 = "C:/Windows/System32";
  if (!process.env.PATH.startsWith(sys32)) {
    process.env.PATH = sys32 + delimiter + process.env.PATH;
  }
}
const res = spawnSync(existsSync(hutchExe) ? hutchExe : "hutch", process.argv.slice(2), {
  stdio: "inherit",
});
if (res.error) {
  console.error(
    `Unable to start Hutch: ${res.error.message}. See README.md for installation instructions.`,
  );
}
process.exit(res.status ?? 1);
