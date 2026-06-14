import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEnv } from "~/server/env";
import {
	ensureDriveRootFolder,
	pollGoogleDeviceFlow,
	startGoogleDeviceFlow,
} from "~/server/google/service";
import {
	refreshMoodleMetadata,
	testMoodleConnection,
	withMoodleToken,
} from "~/server/moodle/service";
import { createSecretStore } from "~/server/secrets";
import { ensureSingletonRows } from "~/server/store";
import {
	createTestDatabase,
	destroyTestDatabase,
} from "../../tests/support/database";

let databaseDir = "";
let databaseUrl = "";
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];

beforeEach(async () => {
	({ databaseDir, databaseUrl, prisma } =
		await createTestDatabase("service-defaults-"));
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await destroyTestDatabase({ databaseDir, prisma });
});

describe("service default factories", () => {
	it("covers default google service branches without credentials", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);

		await expect(
			startGoogleDeviceFlow(prisma, secretStore, env),
		).rejects.toThrow();
		await expect(
			ensureDriveRootFolder(prisma, secretStore, env),
		).rejects.toThrow();

		await prisma.googleDeviceFlow.create({
			data: {
				deviceCode: "device-code",
				userCode: "ABCD-EFGH",
				verificationUrl: "https://www.google.com/device",
				intervalSeconds: 5,
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		await expect(
			pollGoogleDeviceFlow(prisma, secretStore, env),
		).rejects.toThrow();
	});

	it("covers default moodle service branches with incomplete credentials", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);

		await expect(
			testMoodleConnection(prisma, secretStore, env),
		).rejects.toThrow();
		await expect(
			withMoodleToken(prisma, secretStore, env, async () => "x"),
		).rejects.toThrow();
		await expect(
			refreshMoodleMetadata(prisma, secretStore, env),
		).rejects.toThrow();
	});
});
