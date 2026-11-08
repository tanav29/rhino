export interface TerminalToken {
  start: number;
  end: number;
  text: string;
  kind: "url" | "path" | "ip" | "hash" | "number";
}

function trimPunctuation(value: string) {
  value = value.replace(/[.,;!?]+$/, "");
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]) {
    while (value.endsWith(close) && value.split(close).length > value.split(open).length)
      value = value.slice(0, -1);
  }
  return value;
}

function isPath(value: string) {
  return /^(?:[a-z]:[\\/]|\\\\|\.{0,2}\/|~[\\/])|[\\/]|^\.[\w.-]+$|^[\w@.-]+\.[a-z][\w.-]*(?::\d+(?::\d+)?)?$/i.test(
    value,
  );
}

/** UTF-16 offsets, matching DOM Range offsets. Ordered from most to least specific. */
export function terminalTokenAt(text: string, offset: number): TerminalToken | null {
  const rules: [TerminalToken["kind"], RegExp][] = [
    ["url", /\b(?:https?|file):\/\/[^\s<>"'`]+/gi],
    ["path", /["'][^"'\r\n]+["']/g],
    [
      "ip",
      /\[(?:[\da-f]{0,4}:){2,}[\da-f:.%]+\](?::\d+)?|\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b|(?<![\w:])(?:[\da-f]{0,4}:){2,}[\da-f:.%]*(?![\w:])/gi,
    ],
    // Skip enclosing punctuation at the start, but keep parentheses within paths.
    ["path", /[^\s<>"'`|=,;()[\]{}][^\s<>"'`|=,;[\]{}]*/g],
    ["hash", /\b[\da-f]{7,64}\b/gi],
    ["number", /(?<![\w.])[+-]?(?:0x[\da-f]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?%?)(?![\w.])/gi],
  ];
  for (const [kind, pattern] of rules) {
    for (const match of text.matchAll(pattern)) {
      let start = match.index;
      let value = match[0];
      if (kind === "path" && /^["']/.test(value)) {
        start++;
        value = value.slice(1, -1);
      } else if (kind === "url" || kind === "path") value = trimPunctuation(value);
      if (offset < start || offset >= start + value.length) continue;
      if (kind === "path" && !isPath(value)) continue;
      // A decimal or IPv4 address is more useful as a whole than as a filename.
      if (kind === "path" && /^[+-]?[\d._]+(?:e[+-]?\d+)?%?$/i.test(value)) continue;
      if (
        kind === "ip" &&
        /^\d+\./.test(value) &&
        value
          .split(":")[0]
          .split(".")
          .some((n) => +n > 255)
      )
        continue;
      return { start, end: start + value.length, text: value, kind };
    }
  }
  return null;
}
