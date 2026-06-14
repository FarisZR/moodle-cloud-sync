import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests",
	use: {
		baseURL: process.env.APP_BASE_URL ?? "http://127.0.0.1:3000",
		headless: true,
	},
});
