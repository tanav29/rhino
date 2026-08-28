export default {
  packageManager: "bun",
  electrobun: {
    version: "2.0.1",
  },
  scripts: {
    install: ["bun", "install", "--frozen-lockfile"],
    start:
      "hutch electrobun prepare && node node_modules/vite/bin/vite.js build && node scripts/clean-webview.mjs && hutch electrobun dev",
    dev: "hutch electrobun prepare && node node_modules/vite/bin/vite.js build && node scripts/clean-webview.mjs && hutch electrobun dev --watch",
    "dev:hmr":
      'hutch electrobun prepare && node scripts/clean-webview.mjs && node node_modules/concurrently/dist/bin/index.js "node node_modules/vite/bin/vite.js --port 5173" "hutch electrobun dev"',
    hmr: "node node_modules/vite/bin/vite.js --port 5173",
    build:
      "hutch electrobun prepare && node node_modules/vite/bin/vite.js build && hutch electrobun build --env=stable",
    "build:canary":
      "hutch electrobun prepare && node node_modules/vite/bin/vite.js build && hutch electrobun build --env=canary",
  },
};
