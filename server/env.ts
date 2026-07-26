const hostname = process.env.HOST || "127.0.0.1";
const vitePort = 5173;
const serverPortDefault = parseInt(process.env.PORT || "4242", 10);
const MAX_PREVIEW_FILE_SIZE = 2_000_000;
const MAX_LISTED_FILES = 20000;
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "target",
  "venv",
  ".venv",
  "__pycache__",
  ".cache",
  "coverage",
]);

export {
  hostname,
  vitePort,
  serverPortDefault,
  MAX_PREVIEW_FILE_SIZE,
  MAX_LISTED_FILES,
  IGNORED_DIR_NAMES,
};
