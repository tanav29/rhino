import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Languages kept in the diff highlighter. Everything else is dropped at
 * build time so shiki's 200+ grammars never reach the app bundle; unknown
 * file types simply highlight as plain text.
 */
const HIGHLIGHT_LANGUAGES = new Set([
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "json",
  "jsonc",
  "json5",
  "css",
  "scss",
  "less",
  "html",
  "xml",
  "markdown",
  "mdx",
  "python",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "dart",
  "scala",
  "c",
  "cpp",
  "csharp",
  "fsharp",
  "objective-c",
  "objective-cpp",
  "php",
  "ruby",
  "shellscript",
  "powershell",
  "bat",
  "perl",
  "lua",
  "sql",
  "yaml",
  "toml",
  "ini",
  "docker",
  "makefile",
  "cmake",
  "vue",
  "vue-html",
  "svelte",
  "graphql",
  "diff",
  "graphql",
  "haskell",
  "elixir",
  "erlang",
  "clojure",
  "groovy",
  "zig",
  "julia",
  "r",
]);

/** Filters shiki's `{ "id": ..., "import": () => import(...) }[]` registries by rebuilding the array. */
function filterShikiRegistry(code: string, keep: (id: string) => boolean): string {
  return code.replace(
    /const\s+(bundled(?:Languages|Themes)Info)\s*=\s*\[([\s\S]*?)\];/g,
    (_full, varName: string, inner: string) => {
      const entryRe =
        /\{[^{}]*?"id": "([^"]+)"[^{}]*?"import": \(\(\) => import\("[^"]+"\)\)[^{}]*?\}/g;
      let m: RegExpExecArray | null;
      const kept: string[] = [];
      while ((m = entryRe.exec(inner)) !== null) {
        if (keep(m[1])) kept.push(m[0]);
      }
      return `const ${varName}=[${kept.join(",")}];`;
    },
  );
}

/**
 * Build-time slimming: shiki's full bundle registers 200+ language grammars
 * and 60+ themes as dynamic imports, each emitting a chunk. The app only
 * needs a common language subset and the github-dark-default theme.
 */
function slimShiki(): Plugin {
  return {
    name: "slim-shiki",
    transform(code, id) {
      const normalized = id.replaceAll("\\", "/");
      if (/shiki\/dist\/langs-bundle-full-.*\.mjs$/.test(normalized)) {
        return filterShikiRegistry(code, (lang) => HIGHLIGHT_LANGUAGES.has(lang));
      }
      if (normalized.endsWith("shiki/dist/themes.mjs")) {
        return filterShikiRegistry(code, (theme) => theme === "github-dark-default");
      }
      if (normalized.endsWith("pierre/theming/dist/collections/shiki.js")) {
        return `import { createThemeCollection } from "../modules/createThemeCollection.js";
import { createTheme } from "../modules/createTheme.js";
const SHIKI_COLLECTION = "shiki";
const SHIKI_THEME_IMPORTS = {
	"github-dark-default": () => import("@shikijs/themes/github-dark-default"),
};
function createShikiTheme(name) {
	return createTheme({
		name,
		collection: SHIKI_COLLECTION,
		colorScheme: "dark",
		load: SHIKI_THEME_IMPORTS[name],
	});
}
const shikiThemes = createThemeCollection({ themes: Object.freeze([createShikiTheme("github-dark-default")]) });
export { shikiThemes };
`;
      }
      // The oniguruma WASM engine is never used (js engine is the default);
      // dropping the dynamic import keeps its 600KB payload out.
      if (
        normalized.endsWith("pierre/diffs/dist/highlighter/shared_highlighter.js") ||
        normalized.endsWith("shiki/dist/bundle-full.mjs")
      ) {
        if (!code.includes('import("shiki/wasm")')) return null;
        return code.replaceAll(
          'import("shiki/wasm")',
          'Promise.reject(new Error("oniguruma engine disabled"))',
        );
      }
      return null;
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), slimShiki()],
  base: command === "serve" ? "/" : "./",
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${projectRoot}/` },
      // Maps `electrobun/view` to the SDK projected by `hutch electrobun prepare`.
      ...electrobunViteAliases(resolve(projectRoot, ".hutch/devkit")),
    ],
  },
  // Ghostty resolves its WASM relative to the package. Keeping it out of
  // Vite's dependency pre-bundle preserves that URL in development.
  optimizeDeps: {
    exclude: ["@wterm/ghostty"],
  },
  esbuild: {
    drop: command === "serve" ? [] : ["console", "debugger"],
    legalComments: "none",
  },
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "esnext",
    cssMinify: true,
    cssCodeSplit: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 850,
    reportCompressedSize: false,
    minify: "esbuild",
    rollupOptions: {
      treeshake: true,
      output: {
        compact: true,
        manualChunks(id) {
          const n = id.replaceAll("\\", "/");
          // Split large static vendors, keep shiki/pierre dynamic imports as separate async chunks
          if (n.includes("node_modules")) {
            if (n.includes("/zustand/")) return "zustand";
            if (n.includes("/@wterm/")) return "terminal";
            if (n.includes("/@base-ui")) return "ui";
            // Keep shiki & pierre as auto-split dynamic chunks (do not bundle)
            if (n.includes("/shiki") || n.includes("/@shikijs/") || n.includes("/@pierre/"))
              return undefined;
            if (n.includes("/react")) return undefined; // keep react in main to avoid circular
            // lucide-react (icons) stays in vendor: at ~11KB a dedicated chunk
            // isn't worth it and split it off created an icons↔vendor cycle.
            return "vendor";
          }
          if (n.includes("/src/mainview/file-tree") || n.includes("/src/mainview/git-panel"))
            return "panels";
          if (
            n.includes("/src/mainview/new-terminal") ||
            n.includes("/src/mainview/settings-dialog")
          )
            return "dialogs";
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
