import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { TerminalMetadata, type MetadataEvent } from "../src/bun/terminal-metadata";
import { resolveTerminalLink } from "../src/bun/terminal-links";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";
const powershell = process.platform === "win32" ? "powershell.exe" : Bun.which("pwsh");

async function checkShell(command: string[], setup: string, failure: string) {
  const metadata = new TerminalMetadata();
  const events: MetadataEvent[] = [];
  const decoder = new TextDecoder();
  let output = "";
  const terminal = new Bun.Terminal({
    cols: 120,
    rows: 30,
    data(_term, chunk) {
      const text = decoder.decode(chunk, { stream: true });
      output += text;
      events.push(...metadata.write(text));
    },
  });
  const proc = Bun.spawn(command, { terminal, cwd: process.cwd() });
  async function until(predicate: () => boolean) {
    const deadline = Date.now() + 5000;
    while (!predicate() && Date.now() < deadline) await Bun.sleep(20);
    expect(predicate()).toBe(true);
  }
  try {
    terminal.write(setup + "\r");
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
    proc.kill();
    await proc.exited;
    terminal.close();
  }
}

test.skipIf(!existsSync(bash))(
  "Bash integration emits command status and cwd in a real PTY",
  async () => {
    const path = resolve("scripts/shell-integration.bash")
      .replaceAll("\\", "/")
      .replaceAll("'", "'\\''");
    await checkShell([bash, "--noprofile", "--norc", "-i"], `source '${path}'`, "false");
  },
  15_000,
);

test.skipIf(!powershell)(
  "PowerShell integration emits command status and cwd in a real PTY",
  async () => {
    const path = resolve("scripts/shell-integration.ps1").replaceAll("'", "''");
    await checkShell(
      [powershell!, "-NoProfile", "-NoLogo", "-NoExit"],
      `. '${path}'`,
      "Write-Error 'test failure'",
    );
  },
  15_000,
);
