import "dotenv/config";

import path from "node:path";

import { defineConfig } from "prisma/config";

const appDataDir = process.env.APP_DATA_DIR ?? path.join(process.cwd(), "data");

export default defineConfig({
	datasource: {
		url: process.env.DATABASE_URL ?? `file:${path.join(appDataDir, "app.db")}`,
	},
	migrations: {
		path: "prisma/migrations",
	},
	schema: "prisma/schema.prisma",
});
