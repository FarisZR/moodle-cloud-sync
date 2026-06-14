import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [react()],
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		clearMocks: true,
		coverage: {
			exclude: [
				"playwright.config.ts",
				"src/app/**",
				"src/components/**",
				"src/hooks/**",
				"src/styles/**",
			],
			include: ["src/server/**/*.ts"],
			provider: "v8",
			reporter: ["text", "lcov"],
			thresholds: {
				"src/server/**/*.ts": { 100: true },
			},
		},
		environment: "node",
		globals: false,
		root: rootDir,
	},
});
