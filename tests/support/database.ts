import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createPrismaClient } from "~/server/db";

export async function createTestDatabase(prefix: string) {
	const databaseDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const databaseUrl = `file:${path.join(databaseDir, "test.db")}`;

	execFileSync("pnpm", ["exec", "prisma", "db", "push"], {
		cwd: process.cwd(),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		stdio: "pipe",
	});

	return {
		databaseDir,
		databaseUrl,
		prisma: createPrismaClient(databaseUrl),
	};
}

export async function destroyTestDatabase(input: {
	databaseDir: string;
	prisma?: ReturnType<typeof createPrismaClient>;
}) {
	await input.prisma?.$disconnect();
	await fs.rm(input.databaseDir, { force: true, recursive: true });
}
