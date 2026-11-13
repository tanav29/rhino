import { unzipSync, strFromU8 } from "fflate";
import { parse, type ParseError } from "jsonc-parser";
import { posix } from "node:path";
import type { TerminalTheme } from "../shared/rpc-schema";

const keys = [
  "terminal.background",
  "terminal.foreground",
  "terminalCursor.foreground",
  "terminal.selectionBackground",
  ...[
    "Black",
    "Red",
    "Green",
    "Yellow",
    "Blue",
    "Magenta",
    "Cyan",
    "White",
    "BrightBlack",
    "BrightRed",
    "BrightGreen",
    "BrightYellow",
    "BrightBlue",
    "BrightMagenta",
    "BrightCyan",
    "BrightWhite",
  ].map((name) => `terminal.ansi${name}`),
];

export function readThemePackage(data: Uint8Array, extension: string): TerminalTheme[] {
  let total = 0;
  const files = unzipSync(data, {
    filter: (file) => {
      if (!file.name.startsWith("extension/") || !/\.(json|jsonc)$/i.test(file.name)) return false;
      total += file.originalSize;
      if (file.originalSize > 2_000_000 || total > 12_000_000)
        throw new Error("Theme package is too large");
      return true;
    },
  });
  const read = (name: string) => {
    const file = files[name];
    if (!file) throw new Error(`Missing theme file: ${name}`);
    const errors: ParseError[] = [];
    const value = parse(strFromU8(file), errors, { allowTrailingComma: true });
    if (errors.length || !value || typeof value !== "object")
      throw new Error(`Invalid JSON: ${name}`);
    return value;
  };
  const manifest = read("extension/package.json");
  const themes = manifest.contributes?.themes;
  if (!Array.isArray(themes) || themes.length > 100)
    throw new Error("This extension does not contribute color themes");
  const resolveColors = (path: string, seen = new Set<string>()): Record<string, unknown> => {
    if (!path.startsWith("extension/") || seen.has(path) || seen.size >= 20)
      throw new Error("Invalid theme include");
    seen.add(path);
    const theme = read(path);
    const inherited =
      typeof theme.include === "string"
        ? resolveColors(posix.normalize(posix.join(posix.dirname(path), theme.include)), seen)
        : {};
    const defaults = Array.isArray(theme.tokenColors)
      ? theme.tokenColors.find(
          (entry: { scope?: unknown; settings?: unknown }) => !entry.scope && entry.settings,
        )?.settings
      : undefined;
    return {
      ...inherited,
      ...(defaults?.background ? { "editor.background": defaults.background } : {}),
      ...(defaults?.foreground ? { "editor.foreground": defaults.foreground } : {}),
      ...(theme.colors && typeof theme.colors === "object" ? theme.colors : {}),
    };
  };
  return themes.map((theme: { path?: unknown; label?: unknown; id?: unknown }, index: number) => {
    if (typeof theme.path !== "string") throw new Error("Invalid theme path");
    const colors = resolveColors(posix.normalize(posix.join("extension", theme.path)));
    const filtered: Record<string, string> = {};
    for (const key of keys)
      if (
        typeof colors[key] === "string" &&
        /^#[\da-f]{6}([\da-f]{2})?$/i.test(colors[key] as string)
      )
        filtered[key] = colors[key] as string;
    for (const [terminal, editor] of [
      ["terminal.background", "editor.background"],
      ["terminal.foreground", "editor.foreground"],
    ]) {
      const value = colors[editor];
      if (
        !filtered[terminal] &&
        typeof value === "string" &&
        /^#[\da-f]{6}([\da-f]{2})?$/i.test(value)
      )
        filtered[terminal] = value;
    }
    return {
      id: `${extension}:${index}`,
      name:
        typeof theme.label === "string"
          ? theme.label
          : typeof theme.id === "string"
            ? theme.id
            : `${extension} ${index + 1}`,
      colors: filtered,
    };
  });
}

export async function installMarketplaceThemes({
  extension,
}: {
  extension: string;
}): Promise<TerminalTheme[]> {
  const match =
    /^(?:https:\/\/marketplace\.visualstudio\.com\/items\?itemName=)?([\w-]+)\.([\w-]+)$/i.exec(
      extension.trim(),
    );
  if (!match) throw new Error("Enter a Marketplace extension ID, such as publisher.extension");
  const [, publisher, name] = match;
  const response = await fetch(
    `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/latest/vspackage`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`Marketplace download failed (${response.status})`);
  const length = Number(response.headers.get("content-length"));
  if (length > 25_000_000) throw new Error("Extension package is too large");
  if (!response.body) throw new Error("Empty Marketplace response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 25_000_000) {
      await reader.cancel();
      throw new Error("Extension package is too large");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return readThemePackage(data, `${publisher}.${name}`);
}
