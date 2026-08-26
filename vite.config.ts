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
  "typescript", "javascript", "tsx", "jsx", "json", "jsonc", "json5",
  "css", "scss", "less", "html", "xml", "markdown", "mdx",
  "python", "go", "rust", "java", "kotlin", "swift", "dart", "scala",
  "c", "cpp", "csharp", "fsharp", "objective-c", "objective-cpp",
  "php", "ruby", "shellscript", "powershell", "bat", "perl", "lua",
  "sql", "yaml", "toml", "ini", "docker", "makefile", "cmake",
  "vue", "vue-html", "svelte", "graphql", "diff", "graphql",
  "haskell", "elixir", "erlang", "clojure", "groovy", "zig", "julia", "r",
]);

/** Filters shiki's `{ "id": ..., "import": () => import(...) }[]` registries by rebuilding the array. */
function filterShikiRegistry(code: string, keep: (id: string) => boolean): string {
  return code.replace(
    /const\s+(bundled(?:Languages|Themes)Info)\s*=\s*\[([\s\S]*?)\];/g,
    (_full, varName: string, inner: string) => {
      const entryRe = /\{[^{}]*?"id": "([^"]+)"[^{}]*?"import": \(\(\) => import\("[^"]+"\)\)[^{}]*?\}/g;
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
 * needs a common language subset and the aurora-x theme.
 */
function slimShiki(): Plugin {
  return {
    name: "slim-shiki",
    transform(code, id) {
      const normalized = id.replaceAll("\\", "/");
      if (/shiki\/dist\/langs-bundle-full-.*\.mjs$/.test(normalized)) {
        return filterShikiRegistry(code, (lang) => HIGHLIGHT_LANGUAGES.has(lang));
      }
      if (/shiki\/dist\/themes\.mjs$/.test(normalized)) {
        return filterShikiRegistry(code, (theme) => theme === "aurora-x");
      }
      if (/pierre\/theming\/dist\/collections\/shiki\.js$/.test(normalized)) {
        return `import { createThemeCollection } from "../modules/createThemeCollection.js";
import { createTheme } from "../modules/createTheme.js";
const SHIKI_COLLECTION = "shiki";
const SHIKI_THEME_IMPORTS = {
	"aurora-x": () => import("@shikijs/themes/aurora-x"),
};
function createShikiTheme(name) {
	return createTheme({
		name,
		collection: SHIKI_COLLECTION,
		colorScheme: "dark",
		load: SHIKI_THEME_IMPORTS[name],
	});
}
const shikiThemes = createThemeCollection({ themes: Object.freeze([createShikiTheme("aurora-x")]) });
export { shikiThemes };
`;
      }
      // The oniguruma WASM engine is never used (js engine is the default);
      // dropping the dynamic import keeps its 600KB payload out.
      if (
        /pierre\/diffs\/dist\/highlighter\/shared_highlighter\.js$/.test(normalized) ||
        /shiki\/dist\/bundle-full\.mjs$/.test(normalized)
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
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "esnext",
    cssMinify: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
