export default {
	packageManager: "bun",
	electrobun: {
		version: "2.0.1",
	},
	scripts: {
		install: ["hutch", "pm", "install", "--frozen-lockfile"],
		start: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev",
		dev: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch",
		"dev:hmr": ["hutch", "pm", "exec", "--", "concurrently", "hutch run hmr", "hutch run start"],
		hmr: "hutch electrobun prepare && hutch pm exec -- vite --port 5173",
		build: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable",
		"build:canary": "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=canary",
	},
};
