export default {
  packageManager: "bun",
  electrobun: {
    version: "2.0.1",
  },
  scripts: {
    install: ["bun", "install", "--frozen-lockfile"],
    start:
      "hutch electrobun prepare && bun node_modules/vite/bin/vite.js build && hutch electrobun dev",
    dev: "hutch electrobun prepare && bun node_modules/vite/bin/vite.js build && hutch electrobun dev --watch",
    "dev:hmr":
      'hutch electrobun prepare && bun node_modules/vite/bin/vite.js build && bun node_modules/concurrently/dist/bin/index.js -k "bun node_modules/vite/bin/vite.js" "hutch electrobun dev"',
    hmr: "bun node_modules/vite/bin/vite.js",
    build:
      "hutch electrobun prepare && bun run type-check && bun node_modules/vite/bin/vite.js build && hutch electrobun build --env=stable",
    "build:canary":
      "hutch electrobun prepare && bun run type-check && bun node_modules/vite/bin/vite.js build && hutch electrobun build --env=canary",
  },
};
