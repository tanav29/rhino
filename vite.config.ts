import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // Ghostty resolves its WASM relative to the package. Keeping it out of
  // Vite's dependency pre-bundle preserves that URL in development.
  optimizeDeps: {
    exclude: ["@wterm/ghostty"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
