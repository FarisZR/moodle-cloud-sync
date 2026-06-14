import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((entry) => fs.rm(entry, { force: true, recursive: true })),
	);
	vi.resetModules();
	delete (globalThis as { prisma?: unknown }).prisma;
});

describe("db module", () => {
	it("caches the prisma client outside production", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "moodle-sync-db-dev-"));
		tempDirs.push(dir);
		process.env.APP_DATA_DIR = dir;
		process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
		Reflect.set(process.env, "NODE_ENV", "development");

		const mod = await import("~/server/db");
		await mod.db.$disconnect();

		expect((globalThis as { prisma?: unknown }).prisma).toBeDefined();
	});

	it("does not cache prisma globally in production", async () => {
		const dir = await fs.mkdtemp(
			path.join(os.tmpdir(), "moodle-sync-db-prod-"),
		);
		tempDirs.push(dir);
		process.env.APP_DATA_DIR = dir;
		process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
		Reflect.set(process.env, "NODE_ENV", "production");

		const mod = await import("~/server/db");
		await mod.db.$disconnect();

		expect((globalThis as { prisma?: unknown }).prisma).toBeUndefined();
	});
});
