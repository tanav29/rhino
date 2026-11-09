// A real child process exercises streaming, startup, failure, and cancellation without publishing.
const mode = Bun.argv[2];
const config = Bun.argv[Bun.argv.indexOf("--config") + 1];
if ((await Bun.file(config).text()).trim() !== "{}") process.exit(2);
if (!Bun.argv.includes("--no-autoupdate")) process.exit(2);
if (mode === "crash") {
  console.error("ERR fixture connection failed");
  process.exit(1);
}
console.error(`PID ${process.pid} CONFIG ${config}`);
process.stderr.write("https://rhino-fixture.");
await Bun.sleep(30);
console.error("trycloudflare.com");
if (mode !== "timeout") {
  await Bun.sleep(80);
  console.error("Registered tunnel connection connIndex=0");
}
setInterval(() => {}, 1000);
