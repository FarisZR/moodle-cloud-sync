import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "~/server/env";
import {
	ensureDriveRootFolder,
	pollGoogleDeviceFlow,
	saveGoogleClientCredentials,
	startGoogleDeviceFlow,
	withGoogleAccessToken,
} from "~/server/google/service";
import { createSecretStore } from "~/server/secrets";
import { ensureSingletonRows, SECRET_KEYS } from "~/server/store";
import {
	createTestDatabase,
	destroyTestDatabase,
} from "../../../tests/support/database";

let databaseDir = "";
let databaseUrl = "";
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];

beforeEach(async () => {
	({ databaseDir, databaseUrl, prisma } =
		await createTestDatabase("google-service-"));
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await destroyTestDatabase({ databaseDir, prisma });
});

describe("google service", () => {
	it("stores UI-supplied google client credentials", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);

		await saveGoogleClientCredentials(prisma, secretStore, {
			clientId: "ui-client-id",
			clientSecret: "ui-client-secret",
		});

		expect(
			(
				await prisma.googleConnection.findUniqueOrThrow({
					where: { id: "google" },
				})
			).clientId,
		).toBe("ui-client-id");
		expect(await secretStore.get(SECRET_KEYS.googleClientSecret)).toBe(
			"ui-client-secret",
		);
	});

	it("fails to start when google credentials are missing", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);

		await expect(
			startGoogleDeviceFlow(prisma, secretStore, env),
		).rejects.toThrow("Google client credentials are not configured");
	});

	it("starts and stores google device authorization flow", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		const createClient = vi.fn(() => ({
			requestDeviceCode: vi.fn(async () => ({
				deviceCode: "device-code",
				expiresIn: 1800,
				interval: 5,
				userCode: "ABCD-EFGH",
				verificationUrl: "https://www.google.com/device",
			})),
		}));

		const flow = await startGoogleDeviceFlow(
			prisma,
			secretStore,
			env,
			createClient,
		);

		expect(flow.userCode).toBe("ABCD-EFGH");
		expect(
			(
				await prisma.googleDeviceFlow.findUniqueOrThrow({
					where: { id: "google-device-flow" },
				})
			).deviceCode,
		).toBe("device-code");
	});

	it("completes device flow, stores refresh token, and ensures root folder", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await prisma.googleDeviceFlow.upsert({
			create: {
				deviceCode: "device-code",
				userCode: "ABCD-EFGH",
				verificationUrl: "https://www.google.com/device",
				intervalSeconds: 5,
				expiresAt: new Date(Date.now() + 1000 * 60),
			},
			update: {
				deviceCode: "device-code",
				userCode: "ABCD-EFGH",
				verificationUrl: "https://www.google.com/device",
				intervalSeconds: 5,
				expiresAt: new Date(Date.now() + 1000 * 60),
			},
			where: { id: "google-device-flow" },
		});

		const createClient = vi.fn(() => ({
			ensureFolder: vi.fn().mockResolvedValueOnce({
				id: "root-folder-id",
				name: "Moodle Study Sync",
				url: "https://drive.google.com/drive/folders/root-folder-id",
			}),
			getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
			pollDeviceCode: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				idToken: null,
				refreshToken: "refresh-token",
				status: "approved" as const,
				tokenType: "Bearer",
			})),
		}));

		const result = await pollGoogleDeviceFlow(
			prisma,
			secretStore,
			env,
			createClient,
		);

		expect(result.status).toBe("approved");
		expect(await secretStore.get(SECRET_KEYS.googleRefreshToken)).toBe(
			"refresh-token",
		);
		expect(
			(
				await prisma.googleConnection.findUniqueOrThrow({
					where: { id: "google" },
				})
			).driveRootFolderId,
		).toBe("root-folder-id");
	});

	it("refreshes google access tokens from the stored refresh token", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");

		const createClient = vi.fn(() => ({
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
		}));

		const result = await withGoogleAccessToken(
			prisma,
			secretStore,
			env,
			createClient,
			(_api, accessToken) => Promise.resolve(accessToken),
		);

		expect(result).toBe("access-token");
	});

	it("ensures the drive root folder if connected", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");

		const createClient = vi.fn(() => ({
			ensureFolder: vi.fn(async () => ({
				id: "root-folder-id",
				name: "Moodle Study Sync",
				url: "https://drive.google.com/drive/folders/root-folder-id",
			})),
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
		}));

		const folder = await ensureDriveRootFolder(
			prisma,
			secretStore,
			env,
			createClient,
		);

		expect(folder.id).toBe("root-folder-id");
	});
});
