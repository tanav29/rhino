import { afterEach, expect, test } from "bun:test";
import {
  attachSession,
  getSessionDirectory,
  killAllSessions,
  killSession,
  resizePty,
  setSessionEventSink,
  writePtyInput,
  type SessionEvent,
} from "../src/bun/sessions";

afterEach(killAllSessions);

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(20);
  expect(predicate()).toBe(true);
}

test("real PTY executes input, replays output and resizes", async () => {
  let output = "";
  setSessionEventSink((event) => {
    if (event.kind === "output") output += event.data;
  });
  const params = { sessionId: "interactive", cols: 80, rows: 24, cwd: process.cwd() };
  attachSession(params);
  resizePty(params.sessionId, 100, 30);
  const marker = process.platform === "win32" ? "TERM_SMOKE_Windows_NT" : "TERM_SMOKE_OK";
  writePtyInput(
    params.sessionId,
    process.platform === "win32" ? "echo TERM_SMOKE_%OS%\r" : "printf 'TERM_SMOKE_%s\\n' OK\n",
  );
  await waitFor(() => output.includes(marker));
  expect(attachSession(params).replay).toContain(marker);
});

test("rapid kill and reattach keeps the replacement alive", async () => {
  const events: SessionEvent[] = [];
  setSessionEventSink((event) => events.push(event));
  const params = { sessionId: "restart", cols: 80, rows: 24 };
  attachSession(params);
  killSession(params.sessionId);
  attachSession(params);
  await Bun.sleep(150);
  events.length = 0;
  writePtyInput(params.sessionId, "echo RESTART_OK\r");
  await waitFor(() =>
    events.some((event) => event.kind === "output" && event.data.includes("RESTART_OK")),
  );
});

test("shell exit delivers final output before the exit event", async () => {
  const events: SessionEvent[] = [];
  setSessionEventSink((event) => events.push(event));
  attachSession({ sessionId: "exit", cols: 80, rows: 24 });
  writePtyInput("exit", "echo FINAL_OUTPUT\r\nexit\r\n");
  await waitFor(() => events.some((event) => event.kind === "exit"));
  const exitIndex = events.findIndex((event) => event.kind === "exit");
  expect(
    events
      .slice(0, exitIndex)
      .some((event) => event.kind === "output" && event.data.includes("FINAL_OUTPUT")),
  ).toBe(true);
  expect(events.filter((event) => event.kind === "exit")).toHaveLength(1);
});

test("new sessions resolve the home directory", () => {
  attachSession({ sessionId: "home", cols: 80, rows: 24, cwd: "~" });
  const home = process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
  expect(getSessionDirectory("home")?.cwd).toBe(home || process.cwd());
});
