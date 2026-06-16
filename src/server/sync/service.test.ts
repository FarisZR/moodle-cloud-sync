import { createHash } from "node:crypto";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "~/server/env";
import { saveGoogleClientCredentials } from "~/server/google/service";
import { saveMoodleCredentials } from "~/server/moodle/service";
import { createSecretStore } from "~/server/secrets";
import {
	ensureSingletonRows,
	SECRET_KEYS,
	updateCourseSyncConfig,
} from "~/server/store";
import {
	requestSyncCancellation,
	runMetadataRefresh,
	runSync,
} from "~/server/sync/service";
import {
	createTestDatabase,
	destroyTestDatabase,
} from "../../../tests/support/database";

let databaseDir = "";
let databaseUrl = "";
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];

beforeEach(async () => {
	({ databaseDir, databaseUrl, prisma } =
		await createTestDatabase("sync-service-"));
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await destroyTestDatabase({ databaseDir, prisma });
});

async function seedDiscoveredCourse() {
	await prisma.moodleCourse.upsert({
		create: { fullName: "Databases", id: 42, shortName: "DB" },
		update: { fullName: "Databases", shortName: "DB" },
		where: { id: 42 },
	});
}

describe("sync service", () => {
	it("runs a successful sync and persists drive mappings", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await saveGoogleClientCredentials(prisma, secretStore, {
			clientId: "ui-client-id",
			clientSecret: "ui-client-secret",
		});
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");

		const moodleClient = {
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: null,
				wstoken: "fresh-token",
			})),
			downloadFile: vi.fn(async () => Buffer.from("hello world", "utf8")),
			getCourseContents: vi.fn(async () => [
				{
					id: 101,
					modules: [
						{
							contents: [
								{
									filename: "intro.pdf",
									filepath: "/",
									filesize: 11,
									fileurl:
										"https://moodle.example.test/pluginfile.php/1/intro.pdf",
									mimetype: "application/pdf",
									timemodified: 1700000000,
								},
							],
							id: 201,
							modname: "resource",
							name: "Intro",
							uservisible: true,
							visible: 1,
						},
					],
					name: "Week 1",
					section: 1,
					uservisible: true,
					visible: 1,
				},
			]),
			getCourses: vi.fn(async () => [
				{ fullname: "Databases", id: 42, shortname: "DB", visible: 1 },
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		};
		const googleClient = {
			ensureFolder: vi
				.fn()
				.mockResolvedValueOnce({
					id: "root-folder-id",
					name: "Moodle Study Sync",
					url: "https://drive.google.com/drive/folders/root-folder-id",
				})
				.mockResolvedValueOnce({
					id: "course-folder-id",
					name: "Databases",
					url: "https://drive.google.com/drive/folders/course-folder-id",
				}),
			getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
			uploadFile: vi.fn(async () => ({
				id: "drive-file-id",
				name: "Week 1 - Intro - intro.pdf",
				url: "https://drive.google.com/file/d/drive-file-id/view",
			})),
			updateFile: vi.fn(),
		};

		await seedDiscoveredCourse();
		await updateCourseSyncConfig(prisma, {
			courseId: 42,
			enabled: true,
		});

		const summary = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			now: () => new Date("2026-06-14T01:00:00.000Z"),
			runIdFactory: () => "run-1",
		});

		expect(summary.status).toBe("SUCCESS");
		expect(summary.filesUploaded).toBe(1);
		expect(await prisma.driveFolder.findMany()).toHaveLength(1);
		expect(await prisma.syncedFile.findMany()).toEqual([
			expect.objectContaining({
				driveFileId: "drive-file-id",
				sha256: createHash("sha256").update("hello world").digest("hex"),
			}),
		]);
		expect(
			(await prisma.syncRun.findUniqueOrThrow({ where: { id: "run-1" } }))
				.logText,
		).toContain("Uploaded: Week 1 - Intro - intro.pdf");
	});

	it("skips unchanged files on subsequent runs", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await saveGoogleClientCredentials(prisma, secretStore, {
			clientId: "ui-client-id",
			clientSecret: "ui-client-secret",
		});
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");

		const moodleClient = {
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: null,
				wstoken: "fresh-token",
			})),
			downloadFile: vi.fn(async () => Buffer.from("hello world", "utf8")),
			getCourseContents: vi.fn(async () => [
				{
					modules: [
						{
							contents: [
								{
									filename: "intro.pdf",
									filepath: "/",
									filesize: 11,
									fileurl:
										"https://moodle.example.test/pluginfile.php/1/intro.pdf",
									mimetype: "application/pdf",
									timemodified: 1700000000,
								},
							],
							id: 201,
							modname: "resource",
							name: "Intro",
						},
					],
					name: "Week 1",
					section: 1,
				},
			]),
			getCourses: vi.fn(async () => [
				{ fullname: "Databases", id: 42, shortname: "DB", visible: 1 },
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		};
		const googleClient = {
			ensureFolder: vi
				.fn()
				.mockResolvedValueOnce({
					id: "root-folder-id",
					name: "Moodle Study Sync",
					url: "https://drive.google.com/drive/folders/root-folder-id",
				})
				.mockResolvedValueOnce({
					id: "course-folder-id",
					name: "Databases",
					url: "https://drive.google.com/drive/folders/course-folder-id",
				})
				.mockResolvedValue({
					id: "course-folder-id",
					name: "Databases",
					url: "https://drive.google.com/drive/folders/course-folder-id",
				}),
			getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
			uploadFile: vi.fn(async () => ({
				id: "drive-file-id",
				name: "Week 1 - Intro - intro.pdf",
				url: "https://drive.google.com/file/d/drive-file-id/view",
			})),
			updateFile: vi.fn(),
		};

		await seedDiscoveredCourse();
		await updateCourseSyncConfig(prisma, {
			courseId: 42,
			enabled: true,
		});

		await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-1",
		});
		const second = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-2",
		});

		expect(second.filesSkipped).toBe(1);
		expect(googleClient.uploadFile).toHaveBeenCalledTimes(1);
	});

	it("marks partial runs when one file fails", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await saveGoogleClientCredentials(prisma, secretStore, {
			clientId: "ui-client-id",
			clientSecret: "ui-client-secret",
		});
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");

		const moodleClient = {
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: null,
				wstoken: "fresh-token",
			})),
			downloadFile: vi.fn(async (url: string) => Buffer.from(url, "utf8")),
			getCourseContents: vi.fn(async () => [
				{
					modules: [
						{
							contents: [
								{
									filename: "a.pdf",
									filepath: "/",
									filesize: 1,
									fileurl: "https://moodle.example.test/a.pdf",
									mimetype: "application/pdf",
									timemodified: 1,
								},
								{
									filename: "b.pdf",
									filepath: "/",
									filesize: 1,
									fileurl: "https://moodle.example.test/b.pdf",
									mimetype: "application/pdf",
									timemodified: 2,
								},
							],
							id: 201,
							modname: "resource",
							name: "Intro",
						},
					],
					name: "Week 1",
					section: 1,
				},
			]),
			getCourses: vi.fn(async () => [
				{ fullname: "Databases", id: 42, shortname: "DB", visible: 1 },
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		};
		const googleClient = {
			ensureFolder: vi
				.fn()
				.mockResolvedValueOnce({
					id: "root-folder-id",
					name: "Moodle Study Sync",
					url: "https://drive.google.com/drive/folders/root-folder-id",
				})
				.mockResolvedValueOnce({
					id: "course-folder-id",
					name: "Databases",
					url: "https://drive.google.com/drive/folders/course-folder-id",
				}),
			getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
			uploadFile: vi
				.fn()
				.mockResolvedValueOnce({
					id: "drive-file-id-1",
					name: "Week 1 - Intro - a.pdf",
					url: "https://drive.google.com/file/d/drive-file-id-1/view",
				})
				.mockRejectedValueOnce(new Error("Upload failed")),
			updateFile: vi.fn(),
		};

		await seedDiscoveredCourse();
		await updateCourseSyncConfig(prisma, {
			courseId: 42,
			enabled: true,
		});

		const summary = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-1",
		});

		expect(summary.status).toBe("PARTIAL");
		expect(summary.filesFailed).toBe(1);
	});

	it("supports metadata refresh and cancellation", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await saveGoogleClientCredentials(prisma, secretStore, {
			clientId: "ui-client-id",
			clientSecret: "ui-client-secret",
		});
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");

		const moodleClient = {
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: null,
				wstoken: "fresh-token",
			})),
			downloadFile: vi.fn(async () => Buffer.from("hello world", "utf8")),
			getCourseContents: vi.fn(async () => [
				{
					modules: [
						{
							contents: [
								{
									filename: "a.pdf",
									filepath: "/",
									filesize: 1,
									fileurl: "https://moodle.example.test/a.pdf",
									mimetype: "application/pdf",
									timemodified: 1,
								},
								{
									filename: "b.pdf",
									filepath: "/",
									filesize: 1,
									fileurl: "https://moodle.example.test/b.pdf",
									mimetype: "application/pdf",
									timemodified: 2,
								},
							],
							id: 201,
							modname: "resource",
							name: "Intro",
						},
					],
					name: "Week 1",
					section: 1,
				},
			]),
			getCourses: vi.fn(async () => [
				{ fullname: "Databases", id: 42, shortname: "DB", visible: 1 },
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		};
		const googleClient = {
			ensureFolder: vi
				.fn()
				.mockResolvedValueOnce({
					id: "root-folder-id",
					name: "Moodle Study Sync",
					url: "https://drive.google.com/drive/folders/root-folder-id",
				})
				.mockResolvedValueOnce({
					id: "course-folder-id",
					name: "Databases",
					url: "https://drive.google.com/drive/folders/course-folder-id",
				}),
			getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
			uploadFile: vi.fn(async () => {
				await requestSyncCancellation(prisma);
				return {
					id: "drive-file-id-1",
					name: "Week 1 - Intro - a.pdf",
					url: "https://drive.google.com/file/d/drive-file-id-1/view",
				};
			}),
			updateFile: vi.fn(),
		};

		await seedDiscoveredCourse();
		await updateCourseSyncConfig(prisma, {
			courseId: 42,
			enabled: true,
		});

		const refreshSummary = await runMetadataRefresh(prisma, secretStore, env, {
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-refresh",
		});
		const syncSummary = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-sync",
		});

		expect(refreshSummary.status).toBe("SUCCESS");
		expect(syncSummary.status).toBe("CANCELLED");
	});

	it("updates files when metadata changes and skips upload when hash is unchanged", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await saveGoogleClientCredentials(prisma, secretStore, {
			clientId: "ui-client-id",
			clientSecret: "ui-client-secret",
		});
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");
		await seedDiscoveredCourse();
		await updateCourseSyncConfig(prisma, { courseId: 42, enabled: true });

		const moodleClient = {
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: null,
				wstoken: "fresh-token",
			})),
			downloadFile: vi
				.fn()
				.mockResolvedValueOnce(Buffer.from("hello world", "utf8"))
				.mockResolvedValueOnce(Buffer.from("changed content", "utf8")),
			getCourseContents: vi
				.fn()
				.mockResolvedValueOnce([
					{
						modules: [
							{
								contents: [
									{
										filename: "intro.pdf",
										filepath: "/",
										filesize: 11,
										fileurl:
											"https://moodle.example.test/pluginfile.php/1/intro.pdf",
										mimetype: "application/pdf",
										timemodified: 1700000000,
									},
								],
								id: 201,
								modname: "resource",
								name: "Intro",
							},
						],
						name: "Week 1",
						section: 1,
					},
				])
				.mockResolvedValueOnce([
					{
						modules: [
							{
								contents: [
									{
										filename: "intro.pdf",
										filepath: "/",
										filesize: 11,
										fileurl:
											"https://moodle.example.test/pluginfile.php/1/intro.pdf",
										mimetype: "application/pdf",
										timemodified: 1700000000,
									},
								],
								id: 201,
								modname: "resource",
								name: "Intro",
							},
						],
						name: "Week 1",
						section: 1,
					},
				])
				.mockResolvedValueOnce([
					{
						modules: [
							{
								contents: [
									{
										filename: "intro.pdf",
										filepath: "/",
										filesize: 11,
										fileurl:
											"https://moodle.example.test/pluginfile.php/1/intro.pdf",
										mimetype: "application/pdf",
										timemodified: 1700000001,
									},
								],
								id: 201,
								modname: "resource",
								name: "Intro",
							},
						],
						name: "Week 1",
						section: 1,
					},
				]),
			getCourses: vi.fn(async () => [
				{ fullname: "Databases", id: 42, shortname: "DB", visible: 1 },
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		};
		const googleClient = {
			ensureFolder: vi.fn(async () => ({
				id: "course-folder-id",
				name: "Databases",
				url: "https://drive.google.com/drive/folders/course-folder-id",
			})),
			getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
			uploadFile: vi.fn(async () => ({
				id: "drive-file-id",
				name: "Week 1 - Intro - intro.pdf",
				url: "https://drive.google.com/file/d/drive-file-id/view",
			})),
			updateFile: vi.fn(async () => ({
				id: "drive-file-id",
				name: "Week 1 - Intro - intro.pdf",
				url: "https://drive.google.com/file/d/drive-file-id/view",
			})),
		};

		await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-1",
		});
		const hashSkip = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-2",
		});
		const updated = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "run-3",
		});
		const synced = await prisma.syncedFile.findUniqueOrThrow({
			where: { fileKey: (await prisma.moodleFile.findFirstOrThrow()).fileKey },
		});

		expect(hashSkip.filesSkipped).toBe(1);
		expect(updated).toEqual(
			expect.objectContaining({ filesFailed: 0, filesUploaded: 0 }),
		);
		expect(synced.moodleTimeModified).toBe(1700000001);
		expect(updated.filesUpdated).toBe(1);
		expect(googleClient.updateFile).toHaveBeenCalledTimes(1);
	});

	it("handles scoped syncs, disabled courses, and unknown errors", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			GOOGLE_CLIENT_ID: "env-client-id",
			GOOGLE_CLIENT_SECRET: "env-client-secret",
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await saveGoogleClientCredentials(prisma, secretStore, {
			clientId: "ui-client-id",
			clientSecret: "ui-client-secret",
		});
		await secretStore.set(SECRET_KEYS.googleRefreshToken, "refresh-token");
		await prisma.moodleCourse.createMany({
			data: [
				{ fullName: "Databases", id: 42, shortName: "DB" },
				{ fullName: "Algorithms", id: 43, shortName: "ALG" },
			],
		});
		await updateCourseSyncConfig(prisma, { courseId: 42, enabled: true });
		await updateCourseSyncConfig(prisma, { courseId: 43, enabled: false });

		const moodleClient = {
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: null,
				wstoken: "fresh-token",
			})),
			downloadFile: vi.fn(async () => {
				throw "boom";
			}),
			getCourseContents: vi.fn(async (_wstoken: string, courseId: number) =>
				courseId === 42
					? [
							{
								modules: [
									{
										contents: [
											{
												filename: "intro.pdf",
												filepath: "/",
												filesize: 11,
												fileurl:
													"https://moodle.example.test/pluginfile.php/1/intro.pdf",
												mimetype: undefined,
												timemodified: 1700000000,
											},
										],
										id: 201,
										modname: "resource",
										name: "Intro",
									},
								],
								name: "Week 1",
								section: 1,
							},
						]
					: [],
			),
			getCourses: vi.fn(async () => [
				{ fullname: "Databases", id: 42, shortname: "DB", visible: 1 },
				{ fullname: "Algorithms", id: 43, shortname: "ALG", visible: 1 },
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		};
		const googleClient = {
			ensureFolder: vi.fn(async () => ({
				id: "course-folder-id",
				name: "Databases",
				url: "https://drive.google.com/drive/folders/course-folder-id",
			})),
			getDriveProfile: vi.fn(async () => ({ email: "student@example.test" })),
			refreshAccessToken: vi.fn(async () => ({
				accessToken: "access-token",
				expiresIn: 3600,
				tokenType: "Bearer",
			})),
			uploadFile: vi.fn(),
			updateFile: vi.fn(),
		};

		const summary = await runSync(prisma, secretStore, env, {
			createGoogleClient: () => googleClient,
			createMoodleClient: () => moodleClient,
			runIdFactory: () => "scoped-run",
			scopeCourseId: 42,
		});

		expect(summary.filesFailed).toBe(1);
		expect(summary.status).toBe("FAILED");
		expect(moodleClient.getCourseContents).toHaveBeenCalledTimes(1);
		expect(moodleClient.getCourseContents).toHaveBeenCalledWith(
			"fresh-token",
			42,
		);
		expect(googleClient.uploadFile).not.toHaveBeenCalled();
	});
});
