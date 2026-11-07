import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  // Keep the standalone site independent of the desktop app's PostCSS config.
  css: { postcss: { plugins: [] } },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { outDir: "../dist/marketing", emptyOutDir: true },
});
