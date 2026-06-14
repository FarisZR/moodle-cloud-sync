import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSetupPageData } from "~/server/app-state";
import { createPrismaClient } from "~/server/db";
import { readEnv } from "~/server/env";
import { createGoogleDriveClient } from "~/server/google/client";
import {
	ensureDriveRootFolder,
	pollGoogleDeviceFlow,
	withGoogleAccessToken,
} from "~/server/google/service";
import { createMoodleClient } from "~/server/moodle/client";
import {
	refreshMoodleMetadata,
	testMoodleConnection,
	updateStoredMoodleTokens,
	withMoodleToken,
} from "~/server/moodle/service";
import { extractLaunchLocation, parseLaunchToken } from "~/server/moodle/token";
import { runSchedulerTick } from "~/server/scheduler";
import { createSecretStore } from "~/server/secrets";
import {
	clearGoogleConnection,
	clearMoodleCredentials,
	ensureSingletonRows,
	loadCoursesSnapshot,
	loadDashboardSnapshot,
	loadLogsSnapshot,
	putSecret,
	SECRET_KEYS,
	saveGoogleClientSettings,
	saveMoodleSettings,
	saveScheduleSettings,
	updateCourseSyncConfig,
	updateSectionSelection,
} from "~/server/store";
import { runMetadataRefresh, runSync } from "~/server/sync/service";

let databaseDir = "";
let databaseUrl = "";
let prisma: ReturnType<typeof createPrismaClient>;

beforeEach(async () => {
	databaseDir = await fs.mkdtemp(path.join(os.tmpdir(), "moodle-sync-extra-"));
	databaseUrl = `file:${path.join(databaseDir, "test.db")}`;

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

function createEnv(overrides: Partial<NodeJS.ProcessEnv> = {}) {
	return readEnv({
		APP_DATA_DIR: path.join(databaseDir, "data"),
		APP_SECRET_KEY: "test-secret",
		DATABASE_URL: databaseUrl,
		NODE_ENV: "test",
		...overrides,
	});
}

describe("additional server coverage", () => {
	it("covers dashboard, setup, logs, and course snapshot edge cases", async () => {
		await prisma.syncRun.create({
			data: {
				id: "run-1",
				logText: "hello",
				status: "RUNNING",
				trigger: "MANUAL",
			},
		});
		await prisma.googleDeviceFlow.create({
			data: {
				deviceCode: "device-code",
				userCode: "ABCD-EFGH",
				verificationUrl: "https://www.google.com/device",
				intervalSeconds: 5,
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		await prisma.moodleCourse.create({
			data: { fullName: "Databases", id: 42, shortName: "DB" },
		});
		await prisma.courseSyncConfig.create({
			data: {
				courseId: 42,
				enabled: true,
				extensionsCsv: "txt",
				useGlobalExtensions: false,
			},
		});
		await prisma.moodleSection.create({
			data: { courseId: 42, id: "42:1", name: "Week 1", sectionIndex: 1 },
		});
		await prisma.sectionSyncConfig.create({
			data: { sectionId: "42:1", selected: false },
		});
		await prisma.moodleModule.create({
			data: {
				courseId: 42,
				id: 100,
				moduleType: "resource",
				name: "Intro",
				sectionId: "42:1",
			},
		});
		await prisma.moodleFile.create({
			data: {
				courseId: 42,
				fileKey: "file-1",
				filename: "intro.pdf",
				fileSize: 1,
				fileUrl: "https://example.test/intro.pdf",
				lastSeenAt: new Date(),
				moduleId: 100,
				moduleName: "Intro",
				sectionId: "42:1",
				sectionName: "Week 1",
				timeModified: 1,
			},
		});

		const dashboard = await loadDashboardSnapshot(prisma);
		const setup = await loadSetupPageData(prisma);
		const logs = await loadLogsSnapshot(prisma);
		const courses = await loadCoursesSnapshot(prisma);

		expect(dashboard.isSyncRunning).toBe(false);
		expect(setup.googleDeviceFlow?.userCode).toBe("ABCD-EFGH");
		expect(logs).toHaveLength(1);
		expect(courses.courses[0]?.matchingFilesCount).toBe(0);
	});

	it("covers store cleanup and update helpers edge cases", async () => {
		await prisma.moodleCourse.create({
			data: { fullName: "Databases", id: 42, shortName: "DB" },
		});
		await prisma.moodleSection.create({
			data: { courseId: 42, id: "42:1", name: "Week 1", sectionIndex: 1 },
		});
		await prisma.sectionSyncConfig.create({ data: { sectionId: "42:1" } });
		await updateCourseSyncConfig(prisma, {
			courseId: 42,
			enabled: false,
			useGlobalExtensions: true,
		});
		await updateSectionSelection(prisma, "42:1", true);
		await putSecret(prisma, SECRET_KEYS.googleRefreshToken, "cipher");
		await clearGoogleConnection(prisma);
		await clearMoodleCredentials(prisma);

		expect(
			(
				await prisma.courseSyncConfig.findUniqueOrThrow({
					where: { courseId: 42 },
				})
			).enabled,
		).toBe(false);
		expect(
			(
				await prisma.sectionSyncConfig.findUniqueOrThrow({
					where: { sectionId: "42:1" },
				})
			).selected,
		).toBe(true);
		expect(
			(
				await prisma.googleConnection.findUniqueOrThrow({
					where: { id: "google" },
				})
			).hasRefreshToken,
		).toBe(false);
	});

	it("covers google client error and update paths", async () => {
		const existingFolderClient = createGoogleDriveClient({
			fetch: vi.fn(async () =>
				Response.json({
					files: [
						{ id: "folder-1", name: "Folder", webViewLink: "https://custom" },
					],
				}),
			),
		});
		await expect(
			existingFolderClient.ensureFolder({
				accessToken: "token",
				name: "Folder",
				parentId: "parent-1",
			}),
		).resolves.toEqual({
			id: "folder-1",
			name: "Folder",
			url: "https://custom",
		});

		const failingClient = createGoogleDriveClient({
			fetch: vi.fn(
				async () =>
					new Response(JSON.stringify({ error: "bad" }), { status: 500 }),
			),
		});
		await expect(failingClient.getDriveProfile("token")).rejects.toThrow("bad");
		await expect(
			failingClient.refreshAccessToken({
				clientId: "a",
				clientSecret: "b",
				refreshToken: "c",
			}),
		).rejects.toThrow("Google token refresh failed");
		await expect(
			failingClient.requestDeviceCode({ clientId: "a" }),
		).rejects.toThrow("Google device authorization request failed");

		const updateClient = createGoogleDriveClient({
			fetch: vi.fn(async () =>
				Response.json({
					id: "file-1",
					name: "updated.pdf",
					webViewLink: "https://file",
				}),
			),
		});
		await expect(
			updateClient.updateFile({
				accessToken: "token",
				content: Buffer.from("x"),
				fileId: "file-1",
				mimeType: "application/pdf",
				name: "updated.pdf",
			}),
		).resolves.toEqual({
			id: "file-1",
			name: "updated.pdf",
			url: "https://file",
		});
	});

	it("covers google service unhappy paths", async () => {
		const env = createEnv();
		const secretStore = await createSecretStore(prisma, env);

		await expect(
			withGoogleAccessToken(
				prisma,
				secretStore,
				env,
				() => ({
					refreshAccessToken: vi.fn(),
				}),
				async () => "x",
			),
		).rejects.toThrow("Google Drive is not connected");

		await saveGoogleClientSettings(prisma, {
			clientId: "client-id",
			hasClientSecret: true,
		});
		await secretStore.set(SECRET_KEYS.googleClientSecret, "client-secret");
		await prisma.googleDeviceFlow.upsert({
			create: {
				deviceCode: "device-code",
				userCode: "ABCD-EFGH",
				verificationUrl: "https://www.google.com/device",
				intervalSeconds: 5,
				expiresAt: new Date(Date.now() - 60_000),
			},
			update: { expiresAt: new Date(Date.now() - 60_000) },
			where: { id: "google-device-flow" },
		});
		await expect(
			pollGoogleDeviceFlow(prisma, secretStore, env, () => ({
				ensureFolder: vi.fn(),
				getDriveProfile: vi.fn(),
				pollDeviceCode: vi.fn(),
			})),
		).resolves.toEqual({ status: "expired" });

		await prisma.googleDeviceFlow.update({
			data: { expiresAt: new Date(Date.now() + 60_000) },
			where: { id: "google-device-flow" },
		});
		await expect(
			pollGoogleDeviceFlow(prisma, secretStore, env, () => ({
				ensureFolder: vi.fn(),
				getDriveProfile: vi.fn(),
				pollDeviceCode: vi.fn(async () => ({ status: "pending" as const })),
			})),
		).resolves.toEqual({ status: "pending" });

		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");
		await expect(
			ensureDriveRootFolder(prisma, secretStore, env, () => ({
				ensureFolder: vi.fn(async () => ({
					id: "root",
					name: "Root",
					url: "u",
				})),
				refreshAccessToken: vi.fn(async () => ({
					accessToken: "token",
					expiresIn: 1,
					tokenType: "Bearer",
				})),
			})),
		).resolves.toEqual({ id: "root", name: "Root", url: "u" });
	});

	it("covers moodle token parsing and client error branches", async () => {
		await expect(
			extractLaunchLocation(new Response("<html></html>")),
		).resolves.toBeNull();
		await expect(
			(async () =>
				parseLaunchToken({
					baseUrl: "https://moodle.example.test/",
					location: "https://example.test/nope",
					passport: "passport-123",
				}))(),
		).rejects.toThrow("Moodle launch location is missing the mobile token");
		await expect(
			(async () =>
				parseLaunchToken({
					baseUrl: "https://moodle.example.test/",
					location: `moodlemobile://token=${Buffer.from("broken", "utf8").toString("base64")}`,
					passport: "passport-123",
				}))(),
		).rejects.toThrow("Moodle launch token payload is invalid");

		const client = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: vi.fn(async () => new Response(null, { status: 404 })),
		});
		await expect(
			client.downloadFile("https://moodle.example.test/file.pdf", "token"),
		).rejects.toThrow("Moodle file download failed with status 404");
	});

	it("covers moodle service unhappy paths", async () => {
		const env = createEnv();
		const secretStore = await createSecretStore(prisma, env);
		await expect(
			testMoodleConnection(prisma, secretStore, env, () => ({
				authenticateWithCredentials: vi.fn(),
				getSiteInfo: vi.fn(),
			})),
		).rejects.toThrow("Moodle credentials are incomplete");

		await saveMoodleSettings(prisma, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			username: "student@example.test",
		});
		await secretStore.set(SECRET_KEYS.moodlePassword, "password123");

		await expect(
			withMoodleToken(
				prisma,
				secretStore,
				env,
				async () => {
					throw new Error("boom");
				},
				{
					createClient: () => ({
						authenticateWithCredentials: vi.fn(async () => ({
							passport: "p",
							privateToken: null,
							wstoken: "token",
						})),
						getSiteInfo: vi.fn(async () => {
							throw new Error("boom");
						}),
					}),
				},
			),
		).rejects.toThrow("boom");

		await updateStoredMoodleTokens(prisma, secretStore, {
			privateToken: null,
			wstoken: "token",
		});
		await expect(
			refreshMoodleMetadata(prisma, secretStore, env, () => ({
				authenticateWithCredentials: vi.fn(async () => ({
					passport: "p",
					privateToken: null,
					wstoken: "token",
				})),
				getCourseContents: vi.fn(async () => []),
				getCourses: vi.fn(async () => []),
				getSiteInfo: vi.fn(async () => ({ userid: 7 })),
			})),
		).resolves.toEqual({ courseCount: 0, status: "SUCCESS" });
	});

	it("covers scheduler not-due path and sync failure path", async () => {
		const env = createEnv();
		const secretStore = await createSecretStore(prisma, env);
		await saveScheduleSettings(prisma, {
			enabled: true,
			time: "02:00",
			timezone: "Europe/Berlin",
		});
		await prisma.syncRun.create({
			data: {
				id: "scheduled-1",
				startedAt: new Date("2026-06-14T00:10:00.000Z"),
				status: "SUCCESS",
				trigger: "SCHEDULED",
			},
		});
		await expect(
			runSchedulerTick(prisma, secretStore, env, {
				now: new Date("2026-06-14T00:30:00.000Z"),
				runSync: vi.fn(),
			}),
		).resolves.toEqual({ status: "not_due" });

		await clearMoodleCredentials(prisma);
		await clearGoogleConnection(prisma);
		const failed = await runSync(prisma, secretStore, env, {
			runIdFactory: () => "failed-run",
		});
		expect(failed.status).toBe("FAILED");
		expect(
			(await prisma.syncRun.findUniqueOrThrow({ where: { id: "failed-run" } }))
				.errorMessage,
		).toBeTruthy();

		const refreshFailed = await runMetadataRefresh(prisma, secretStore, env, {
			runIdFactory: () => "failed-refresh",
		});
		expect(refreshFailed.status).toBe("FAILED");
	});
});
