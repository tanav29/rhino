import { expect, test } from "bun:test";
import { homedir, hostname } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TerminalMetadata } from "../src/bun/terminal-metadata";
import { resolveTerminalLink } from "../src/bun/terminal-links";
import { terminalTokenAt } from "../src/shared/terminal-tokens";

test("smart selection keeps URLs, paths, addresses, hashes and numbers intact", () => {
  const cases: [string, string, string][] = [
    ["See (https://example.com:8443/a?q=1&b=2).", "8443", "https://example.com:8443/a?q=1&b=2"],
    ["https://example.com/a_(b)", "_(", "https://example.com/a_(b)"],
    ['at "C:\\Program Files\\app\\main.ts:42:7"', "Files", "C:\\Program Files\\app\\main.ts:42:7"],
    ["at src/main.ts:42:7,", "42", "src/main.ts:42:7"],
    ["in ../my-project/app.ts.", "project", "../my-project/app.ts"],
    ["Host: 192.168.1.1:8080", "168", "192.168.1.1:8080"],
    ["Host: [2001:db8::1]:443", "db8", "[2001:db8::1]:443"],
    ["Host: ::1", "::", "::1"],
    ["commit abc1234567", "123", "abc1234567"],
    ["cost: -1.25e-10", "25", "-1.25e-10"],
    ["value: 0xff00", "ff", "0xff00"],
    ["value: 42.75%", "75", "42.75%"],
  ];
  for (const [line, hit, expected] of cases)
    expect(terminalTokenAt(line, line.indexOf(hit))?.text).toBe(expected);
  expect(terminalTokenAt("hello world", 1)).toBeNull();
  expect(terminalTokenAt("https://example.com,", 19)).toBeNull();
});

test("path tokens preserve parentheses and exclude prompt and prose delimiters", () => {
  const path = String.raw`C:\Users\tanav\c\term\build\dev-win-x64\Rhino(dev)-dev`;
  const cases: [string, string][] = [
    [`${path}>`, path],
    [`PS ${path}>`, path],
    [`(${path}).`, path],
    [`${path}(copy)>`, `${path}(copy)`],
    ["(./build/Rhino(dev)/main.ts:42:7)", "./build/Rhino(dev)/main.ts:42:7"],
    ["./build/Rhino(dev(test))-dev", "./build/Rhino(dev(test))-dev"],
  ];
  for (const [line, expected] of cases) {
    const start = line.indexOf(expected);
    for (let offset = start; offset < start + expected.length; offset++)
      expect(terminalTokenAt(line, offset)).toEqual({
        kind: "path",
        text: expected,
        start,
        end: start + expected.length,
      });
    expect(terminalTokenAt(line, start + expected.length)).toBeNull();
  }
});

test("OSC parser handles every split point, both terminators and unrelated OSCs", () => {
  const output =
    "\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\\x1b]2;title;with;semicolons\x07\x1b]7;file:///tmp/project\x1b\\";
  for (let i = 0; i <= output.length; i++) {
    const metadata = new TerminalMetadata();
    const events = [
      ...metadata.write(output.slice(0, i), 0),
      ...metadata.write(output.slice(i), 1),
    ];
    expect(events).toEqual([{ kind: "title", title: "title;with;semicolons" }]);
    expect(metadata.workingDirectory).toBe("file:///tmp/project");
  }
});

test("command completion uses markers, ignores silence and duplicate completions", () => {
  const metadata = new TerminalMetadata();
  expect(metadata.write("\x1b]133;D;0\x07", 0)).toEqual([]);
  expect(metadata.write("\x1b]133;C\x07", 0)).toEqual([]);
  expect(metadata.write("output, still working", 60_000)).toEqual([]);
  metadata.write("\x1b]133;C\x07", 70_000);
  expect(metadata.write("\x1b]133;D;2\x07\x1b]133;A\x07\x1b]133;D;0\x07", 90_000)).toEqual([
    { kind: "commandFinished", durationMs: 90_000, exitCode: 2 },
  ]);
  metadata.write("\x1b]133;C\x07", 100_000);
  expect(metadata.write("\x1b]133;D\x07", 110_000)).toEqual([
    { kind: "commandFinished", durationMs: 10_000, exitCode: null },
  ]);
});

test("agent reports distinguish exact blocked/attention states from activity inference", () => {
  const metadata = new TerminalMetadata();
  metadata.write("output", 0);
  expect(metadata.agent("s", "codex", 1)).toMatchObject({ status: "working", source: "activity" });
  expect(metadata.agent("s", "codex", 20_000)).toMatchObject({
    status: "idle",
    source: "activity",
  });
  metadata.write("\x1b]777;rhino;agent;codex;blocked\x07", 30_000);
  expect(metadata.agent("s", "codex", 90_000)).toMatchObject({
    status: "blocked",
    source: "reported",
  });
  metadata.input(90_000);
  expect(metadata.agent("s", "codex", 90_001)).toMatchObject({
    status: "working",
    source: "activity",
  });
  metadata.write("\x1b]777;rhino;agent;codex;needs-attention\x1b\\", 100_000);
  expect(metadata.agentName).toBe("codex");
  expect(metadata.agent("s", "codex")).toMatchObject({
    status: "needs-attention",
    source: "reported",
  });
  metadata.write("\x1b]133;D;0\x07");
  expect(metadata.agentName).toBeUndefined();
});

test("oversized and cancelled OSCs do not prevent subsequent metadata", () => {
  const metadata = new TerminalMetadata();
  expect(metadata.write("\x1b]2;" + "x".repeat(9000) + "\x1b]2;ok\x07")).toEqual([
    { kind: "title", title: "ok" },
  ]);
  expect(metadata.write("\x1b]2;unfinished\x1b]2;recovered\x07")).toEqual([
    { kind: "title", title: "recovered" },
  ]);
});

test("link resolution handles cwd, home, line suffixes and local file URIs", () => {
  const cwd = process.cwd();
  expect(resolveTerminalLink("src/main.ts:42:7", cwd)).toEqual({
    kind: "path",
    value: resolve(cwd, "src/main.ts"),
  });
  expect(resolveTerminalLink("~/project", cwd).value).toBe(resolve(homedir(), "project"));
  const file = pathToFileURL(resolve(cwd, "space here.ts"));
  file.hash = "L42";
  expect(resolveTerminalLink(file.href, cwd).value).toBe(resolve(cwd, "space here.ts"));
  file.hostname = hostname();
  expect(resolveTerminalLink(file.href, cwd).value).toBe(resolve(cwd, "space here.ts"));
  expect(resolveTerminalLink("https://example.com/a?q=1", cwd).kind).toBe("url");
});

test("link resolution rejects executable URL schemes and foreign file hosts", () => {
  for (const target of [
    "javascript:alert(1)",
    "data:text/html,bad",
    "shell:startup",
    "file://other-host/tmp/a",
    "https://example.com/\nmalicious",
    "a\0b",
  ])
    expect(() => resolveTerminalLink(target, process.cwd())).toThrow();
});
