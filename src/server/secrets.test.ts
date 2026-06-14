import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPrismaClient } from "~/server/db";
import { readEnv } from "~/server/env";
import {
	createSecretStore,
	resolveGoogleClientCredentials,
	resolveMoodleCredentials,
} from "~/server/secrets";
import {
	ensureSingletonRows,
	getSecret,
	SECRET_KEYS,
	saveGoogleClientSettings,
	saveMoodleSettings,
} from "~/server/store";

let databaseDir = "";
let prisma: ReturnType<typeof createPrismaClient>;

beforeEach(async () => {
	databaseDir = await fs.mkdtemp(
		path.join(os.tmpdir(), "moodle-sync-secrets-"),
	);
	const databaseUrl = `file:${path.join(databaseDir, "test.db")}`;

	execFileSync("pnpm", ["exec", "prisma", "db", "push"], {
		cwd: process.cwd(),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		stdio: "pipe",
	});

	prisma = createPrismaClient(databaseUrl);
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await prisma?.$disconnect();
	await fs.rm(databaseDir, { force: true, recursive: true });
});

describe("secret store", () => {
	it("stores encrypted values and returns decrypted values", async () => {
		const secretStore = await createSecretStore(
			prisma,
			readEnv({
				APP_DATA_DIR: path.join(databaseDir, "data"),
				APP_SECRET_KEY: "test-secret-key",
				DATABASE_URL: `file:${path.join(databaseDir, "test.db")}`,
				NODE_ENV: "test",
			}),
		);

		await secretStore.set(SECRET_KEYS.moodlePassword, "hunter2");

		expect(await secretStore.get(SECRET_KEYS.moodlePassword)).toBe("hunter2");
		expect(await getSecret(prisma, SECRET_KEYS.moodlePassword)).not.toBe(
			"hunter2",
		);
	});

	it("deletes stored values", async () => {
		const secretStore = await createSecretStore(
			prisma,
			readEnv({
				APP_DATA_DIR: path.join(databaseDir, "data"),
				APP_SECRET_KEY: "test-secret-key",
				DATABASE_URL: `file:${path.join(databaseDir, "test.db")}`,
				NODE_ENV: "test",
			}),
		);

		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");
		await secretStore.delete(SECRET_KEYS.googleRefreshToken);

		expect(await secretStore.get(SECRET_KEYS.googleRefreshToken)).toBeNull();
	});

	it("resolves google credentials from env or stored secrets", async () => {
		const secretStore = await createSecretStore(
			prisma,
			readEnv({
				APP_DATA_DIR: path.join(databaseDir, "data"),
				APP_SECRET_KEY: "test-secret-key",
				DATABASE_URL: `file:${path.join(databaseDir, "test.db")}`,
				NODE_ENV: "test",
			}),
		);

		await saveGoogleClientSettings(prisma, {
			clientId: "ui-client-id.apps.googleusercontent.com",
			hasClientSecret: true,
		});
		await secretStore.set(SECRET_KEYS.googleClientSecret, "ui-secret");

		expect(
			await resolveGoogleClientCredentials(
				prisma,
				secretStore,
				readEnv({
					APP_DATA_DIR: path.join(databaseDir, "data"),
					APP_SECRET_KEY: "test-secret-key",
					DATABASE_URL: `file:${path.join(databaseDir, "test.db")}`,
					GOOGLE_CLIENT_ID: "env-client-id",
					GOOGLE_CLIENT_SECRET: "env-secret",
					NODE_ENV: "test",
				}),
			),
		).toEqual({ clientId: "env-client-id", clientSecret: "env-secret" });

		expect(
			await resolveGoogleClientCredentials(
				prisma,
				secretStore,
				readEnv({
					APP_DATA_DIR: path.join(databaseDir, "data"),
					APP_SECRET_KEY: "test-secret-key",
					DATABASE_URL: `file:${path.join(databaseDir, "test.db")}`,
					NODE_ENV: "test",
				}),
			),
		).toEqual({
			clientId: "ui-client-id.apps.googleusercontent.com",
			clientSecret: "ui-secret",
		});
	});

	it("resolves stored moodle credentials", async () => {
		const secretStore = await createSecretStore(
			prisma,
			readEnv({
				APP_DATA_DIR: path.join(databaseDir, "data"),
				APP_SECRET_KEY: "test-secret-key",
				DATABASE_URL: `file:${path.join(databaseDir, "test.db")}`,
				NODE_ENV: "test",
			}),
		);

		await saveMoodleSettings(prisma, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			username: "student@example.org",
		});
		await secretStore.set(SECRET_KEYS.moodlePassword, "password123");

		expect(await resolveMoodleCredentials(prisma, secretStore)).toEqual({
			baseUrl: "https://moodle.example.test/",
			organization: "example.org",
			password: "password123",
			username: "student@example.org",
		});
	});
});
