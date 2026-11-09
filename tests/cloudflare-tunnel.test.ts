import { afterEach, expect, test } from "bun:test";
import { createCloudflareTunnel } from "../src/bun/cloudflare-tunnel";

const tunnels: ReturnType<typeof createCloudflareTunnel>[] = [];
afterEach(() => {
  for (const tunnel of tunnels.splice(0)) tunnel.stop();
});
function create(mode = "ready", startupTimeoutMs = 3000) {
  let stopped = 0;
  const tunnel = createCloudflareTunnel({
    command: [process.execPath, `${import.meta.dir}/fixtures/cloudflared.ts`, mode],
    startupTimeoutMs,
    onStopped: () => {
      stopped++;
    },
  });
  tunnels.push(tunnel);
  return { tunnel, stopped: () => stopped };
}
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(10);
  expect(predicate()).toBe(true);
}

test("tunnel waits for registration, parses chunked logs, and stops cleanly", async () => {
  const { tunnel, stopped } = create();
  tunnel.start("http://127.0.0.1:1234");
  expect(tunnel.status().state).toBe("starting");
  await waitFor(() => tunnel.status().state === "running");
  expect(tunnel.status().url).toBe("https://rhino-fixture.trycloudflare.com");
  tunnel.stop();
  expect(tunnel.status()).toEqual({ state: "stopped" });
  expect(stopped()).toBe(1);
  await Bun.sleep(30);
  expect(tunnel.status().state).toBe("stopped");
});

test("startup failures and timeouts revoke the public backend", async () => {
  for (const mode of ["crash", "timeout"]) {
    const { tunnel, stopped } = create(mode, 500);
    tunnel.start("http://127.0.0.1:1234");
    await waitFor(() => tunnel.status().state === "error");
    expect(tunnel.status().error).toContain(
      mode === "crash" ? "fixture connection failed" : "timed out",
    );
    expect(tunnel.status().url).toBeUndefined();
    expect(stopped()).toBe(1);
  }
});

test("cancelled startup cannot publish a late URL; retry creates a fresh process", async () => {
  const { tunnel } = create();
  tunnel.start("http://127.0.0.1:1234");
  tunnel.stop();
  tunnel.start("http://127.0.0.1:1234");
  await waitFor(() => tunnel.status().state === "running");
  expect(tunnel.status().error).toBeUndefined();
});
