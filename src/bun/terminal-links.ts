import { hostname, homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve data only. Never interpolate terminal output into a shell command. */
export function resolveTerminalLink(target: string, cwd: string) {
  if (!target || [...target].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new Error("Invalid terminal link");
  if (/^(?:https?|mailto):/i.test(target)) {
    const url = new URL(target);
    return { kind: "url" as const, value: url.href };
  }
  if (/^file:/i.test(target)) {
    const url = new URL(target);
    if (
      url.hostname &&
      !["localhost", hostname().toLowerCase()].includes(url.hostname.toLowerCase())
    )
      throw new Error("This file link belongs to another machine");
    url.hostname = "";
    url.hash = "";
    url.search = "";
    target = fileURLToPath(url);
  } else if (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    throw new Error("Unsupported terminal link protocol");
  }
  target = target.replace(/:\d+(?::\d+)?$/, "");
  if (/^~(?:[\\/]|$)/.test(target)) target = homedir() + target.slice(1);
  return { kind: "path" as const, value: resolve(cwd, target) };
}
