import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { TerminalMetadata, type MetadataEvent } from "../src/bun/terminal-metadata";
import { resolveTerminalLink } from "../src/bun/terminal-links";

// macOS ships Bash 3.2; prefer the supported Bash installed on PATH (4.4+).
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : Bun.which("bash");
const powershell = process.platform === "win32" ? "powershell.exe" : Bun.which("pwsh");

async function checkShell(command: string[], failure: string) {
  const metadata = new TerminalMetadata();
  const events: MetadataEvent[] = [];
  const decoder = new TextDecoder();
  let output = "";
  let queries = "";
  const terminal = new Bun.Terminal({
    cols: 120,
    rows: 30,
    name: "xterm-256color",
    data(term, chunk) {
      const text = decoder.decode(chunk, { stream: true });
      output += text;
      events.push(...metadata.write(text));
      // PSReadLine queries the cursor on POSIX. This headless PTY has no renderer to reply.
      queries = (queries + text)
        .replaceAll("\x1b[6n", () => {
          term.write("\x1b[1;1R");
          return "";
        })
        .slice(-3);
    },
  });
  const proc = Bun.spawn(command, { terminal, cwd: process.cwd() });
  async function until(predicate: () => boolean) {
    const deadline = Date.now() + 5000;
    while (!predicate() && Date.now() < deadline) await Bun.sleep(20);
    if (!predicate())
      throw new Error(`Shell did not become ready. PTY output: ${JSON.stringify(output)}`);
  }
  try {
    await until(() => output.includes("\x1b]133;B"));
    expect(metadata.workingDirectory).not.toBeNull();
    expect(resolveTerminalLink(metadata.workingDirectory!, process.cwd()).value).toBe(
      process.cwd(),
    );
    events.length = 0;
    terminal.write(failure + "\r");
    await until(() => events.some((event) => event.kind === "commandFinished"));
    expect(events.filter((event) => event.kind === "commandFinished")).toMatchObject([
      { kind: "commandFinished", exitCode: 1 },
    ]);
  } finally {
    // Interactive Bash ignores SIGTERM on POSIX, including when an assertion fails.
    proc.kill("SIGKILL");
    await proc.exited;
    terminal.close();
  }
}

test.skipIf(!bash || !existsSync(bash))(
  "Bash integration emits command status and cwd in a real PTY",
  async () => {
    const path = resolve("scripts/shell-integration.bash").replaceAll("\\", "/");
    await checkShell([bash!, "--noprofile", "--rcfile", path, "-i"], "false");
  },
  15_000,
);

test.skipIf(!powershell)(
  "PowerShell integration emits command status and cwd in a real PTY",
  async () => {
    const path = resolve("scripts/shell-integration.ps1").replaceAll("'", "''");
    await checkShell(
      [powershell!, "-NoProfile", "-NoLogo", "-NoExit", "-Command", `. '${path}'`],
      "Write-Error 'test failure'",
    );
  },
  15_000,
);
