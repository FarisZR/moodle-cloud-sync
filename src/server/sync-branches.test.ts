import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "~/server/env";
import { saveMoodleCredentials } from "~/server/moodle/service";
import { createSecretStore } from "~/server/secrets";
import { ensureSingletonRows, updateCourseSyncConfig } from "~/server/store";
import { requestSyncCancellation, runSync } from "~/server/sync/service";
import {
	createTestDatabase,
	destroyTestDatabase,
} from "../../tests/support/database";

let databaseDir = "";
let databaseUrl = "";
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];

beforeEach(async () => {
	({ databaseDir, databaseUrl, prisma } =
		await createTestDatabase("sync-branches-"));
	await ensureSingletonRows(prisma);
	await prisma.moodleCourse.create({
		data: { fullName: "Databases", id: 42, shortName: "DB" },
	});
	await updateCourseSyncConfig(prisma, { courseId: 42, enabled: false });
});

afterEach(async () => {
	await destroyTestDatabase({ databaseDir, prisma });
});

describe("sync service branches", () => {
	it("rejects when another sync is already running", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await prisma.appSetting.update({
			data: { activeRunStatus: "RUNNING" },
			where: { id: "app" },
		});

		await expect(
			runSync(prisma, secretStore, env, { runIdFactory: () => "busy-run" }),
		).rejects.toThrow("A sync is already running");
	});

	it("covers default client factory setup and disabled course skipping", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);

		const result = await runSync(prisma, secretStore, env, {
			runIdFactory: () => "default-fail",
		});
		expect(result.status).toBe("FAILED");
	});

	it("covers pre-course cancellation branch", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await updateCourseSyncConfig(prisma, { courseId: 42, enabled: true });
		await secretStore.set("google.refreshToken", "refresh-token");

		const result = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => ({
				ensureFolder: vi.fn(async () => {
					await requestSyncCancellation(prisma);
					return {
						id: "folder-id",
						name: "Folder",
						url: "https://drive.google.com/drive/folders/folder-id",
					};
				}),
				getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
				refreshAccessToken: vi.fn(async () => ({
					accessToken: "access-token",
					expiresIn: 3600,
					tokenType: "Bearer",
				})),
				uploadFile: vi.fn(),
				updateFile: vi.fn(),
			}),
			createMoodleClient: () => ({
				authenticateWithCredentials: vi.fn(async () => ({
					passport: "passport-123",
					privateToken: null,
					wstoken: "fresh-token",
				})),
				downloadFile: vi.fn(),
				getCourseContents: vi.fn(async () => []),
				getCourses: vi.fn(async () => [
					{ fullname: "Databases", id: 42, shortname: "DB", visible: 1 },
				]),
				getSiteInfo: vi.fn(async () => ({
					siteurl: "https://moodle.example.test",
					userid: 7,
				})),
			}),
			runIdFactory: () => "cancel-before-course",
		});

		expect(result.status).toBe("CANCELLED");
	});
});
