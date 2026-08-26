import { execSync } from "node:child_process";

if (process.platform !== "win32") process.exit(0);

try {
  execSync(
    `powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'dev\\.10xdevs\\.term' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }"`,
    { stdio: "ignore", timeout: 5000 },
  );
} catch {}
try {
  execSync(
    `powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'bun.exe' -and $_.CommandLine -match 'term-dev' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }"`,
    { stdio: "ignore", timeout: 5000 },
  );
} catch {}
// Give WebView2 time to release the user-data-dir lock
await new Promise((r) => setTimeout(r, 800));
