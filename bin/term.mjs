#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function readPort() {
  const inline = args.find((arg) => arg.startsWith("--port="));
  const index = args.findIndex((arg) => arg === "--port" || arg === "-p");
  const value = inline ? inline.slice("--port=".length) : args[index + 1];
  if (!inline && index === -1) return process.env.PORT || "4242";

  if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    console.error("wterm: --port must be a number between 1 and 65535");
    process.exit(1);
  }
  return value;
}

function run(command, commandArgs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [command, ...commandArgs], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`wterm stopped by ${signal}`));
      else resolvePromise(code ?? 1);
    });
  });
}

const port = readPort();
process.env.PORT = port;
process.env.NODE_ENV = "production";

if (!existsSync(resolve(root, ".next", "BUILD_ID"))) {
  console.log("wterm: production build not found; building once...");
  const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const code = await run(nextBin, ["build"]);
  if (code !== 0) process.exit(code);
}

const tsxBin = resolve(root, "node_modules", "tsx", "dist", "cli.mjs");
const code = await run(tsxBin, [resolve(root, "server.ts")]);
process.exit(code);
