import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendStatus } from "../shared/rpc-schema";

/** Own just the child we launch; never alter the user's Cloudflare configuration. */
export function createCloudflareTunnel(options: {
  onStopped: () => void;
  command?: string[];
  startupTimeoutMs?: number;
}) {
  let state: BackendStatus["internet"] = { state: "stopped" };
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let configDirectory: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stop(error?: string) {
    const previous = child;
    child = undefined;
    clearTimeout(timer);
    previous?.kill();
    if (configDirectory) rmSync(configDirectory, { recursive: true, force: true });
    configDirectory = undefined;
    state = error ? { state: "error", error } : { state: "stopped" };
    options.onStopped();
  }

  return {
    status: () => state,
    stop,
    start(origin: string) {
      if (child) return;
      state = { state: "starting" };
      const command = options.command ?? [Bun.which("cloudflared") ?? ""];
      if (!command[0]) {
        stop("Install cloudflared and restart Rhino, then try sharing again.");
        return;
      }
      try {
        configDirectory = mkdtempSync(join(tmpdir(), "rhino-cloudflared-"));
        const config = join(configDirectory, "config.yml");
        writeFileSync(config, "{}\n");
        const process = Bun.spawn(
          [
            ...command,
            "tunnel",
            "--config",
            config,
            "--no-autoupdate",
            "--url",
            origin,
            "--metrics",
            "127.0.0.1:0",
            "--edge-ip-version",
            "4",
            "--grace-period",
            "0s",
          ],
          { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true },
        );
        child = process;
        let url = "";
        let registered = false;
        let lastError = "";
        async function read(stream: ReadableStream<Uint8Array>) {
          const decoder = new TextDecoder();
          let buffer = "";
          for await (const chunk of stream) {
            if (child !== process) return;
            buffer = (buffer + decoder.decode(chunk, { stream: true })).slice(-16_384);
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              url ||= line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0] ?? "";
              registered ||= line.includes("Registered tunnel connection");
              if (/\b(ERR|error)\b/.test(line)) lastError = line.slice(-500);
            }
            if (url && registered) {
              clearTimeout(timer);
              state = { state: "running", url };
            }
          }
        }
        void Promise.all([read(process.stdout), read(process.stderr)]).catch(() => {
          if (child === process) stop("Unable to read cloudflared output. Try sharing again.");
        });
        void process.exited.then((code) => {
          if (child === process)
            stop(lastError || `cloudflared exited (${code}). Try sharing again.`);
        });
        timer = setTimeout(() => {
          if (child === process)
            stop(lastError || "Cloudflare connection timed out. Check your network and try again.");
        }, options.startupTimeoutMs ?? 45_000);
      } catch (cause) {
        stop(
          `Unable to start cloudflared: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    },
  };
}
