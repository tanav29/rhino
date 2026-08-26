import type { ElectrobunConfig } from "electrobun";

const isDev = process.env.ELECTROBUN_BUILD_ENV === "dev";

export default {
	app: {
		name: isDev ? "term (dev)" : "term",
		identifier: "dev.10xdevs.term",
		version: "0.2.0",
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite builds the React webview to dist/, we copy its output.
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately.
		watchIgnore: ["dist/**"],
		win: {
			icon: "assets/icon.ico",
		},
	},
	runtime: {
		exitOnLastWindowClosed: true,
	},
} satisfies ElectrobunConfig;
