import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "~/server/db";
import {
	clearGoogleConnection,
	clearMoodleCredentials,
	ensureSingletonRows,
	getSecret,
	loadCoursesSnapshot,
	loadDashboardSnapshot,
	loadLogsSnapshot,
	putSecret,
	SECRET_KEYS,
	saveGlobalExtensions,
	saveGoogleClientSettings,
	saveMoodleSettings,
	saveScheduleSettings,
	updateCourseSyncConfig,
	updateSectionSelection,
} from "~/server/store";
import type { PrismaClient } from "../generated/prisma/client";

let databaseDir = "";
let prisma: PrismaClient;

beforeEach(async () => {
	databaseDir = await fs.mkdtemp(path.join(os.tmpdir(), "moodle-sync-db-"));
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

describe("store helpers", () => {
	it("creates the singleton rows", async () => {
		const snapshot = await loadDashboardSnapshot(prisma);

		expect(snapshot.app.globalExtensionsCsv).toBe("pdf");
		expect(snapshot.moodle.baseUrl).toBe("https://moodle.dhbw.de/");
		expect(snapshot.google.clientId).toBeNull();
	});

	it("stores and retrieves secrets", async () => {
		await putSecret(prisma, SECRET_KEYS.moodlePassword, "ciphertext");
		expect(await getSecret(prisma, SECRET_KEYS.moodlePassword)).toBe(
			"ciphertext",
		);
	});

	it("saves moodle settings and clears cached tokens", async () => {
		await putSecret(prisma, SECRET_KEYS.moodleWSToken, "token");
		await saveMoodleSettings(prisma, {
			baseUrl: "https://moodle.example.test",
			organization: "org",
			username: "student@example.test",
		});

		const connection = await prisma.moodleConnection.findUniqueOrThrow({
			where: { id: "moodle" },
		});

		expect(connection.baseUrl).toBe("https://moodle.example.test/");
		expect(connection.credentialsSaved).toBe(true);
		expect(connection.hasToken).toBe(false);
		expect(await getSecret(prisma, SECRET_KEYS.moodleWSToken)).toBeNull();
	});

	it("saves google client settings", async () => {
		await saveGoogleClientSettings(prisma, {
			clientId: "client-id.apps.googleusercontent.com",
			hasClientSecret: true,
		});

		const connection = await prisma.googleConnection.findUniqueOrThrow({
			where: { id: "google" },
		});

		expect(connection.clientId).toBe("client-id.apps.googleusercontent.com");
		expect(connection.clientSecretSaved).toBe(true);
	});

	it("updates schedule settings and global extensions", async () => {
		await saveScheduleSettings(prisma, {
			enabled: true,
			time: "03:30",
			timezone: "Europe/Berlin",
		});
		await saveGlobalExtensions(prisma, ["pdf", ".pptx", "pdf"]);

		const app = await prisma.appSetting.findUniqueOrThrow({
			where: { id: "app" },
		});

		expect(app.scheduleEnabled).toBe(true);
		expect(app.scheduleTime).toBe("03:30");
		expect(app.globalExtensionsCsv).toBe("pdf,pptx");
	});

	it("clears stored moodle and google connection state", async () => {
		await putSecret(prisma, SECRET_KEYS.moodlePassword, "cipher");
		await putSecret(prisma, SECRET_KEYS.googleRefreshToken, "cipher");
		await prisma.moodleConnection.update({
			data: {
				credentialsSaved: true,
				hasToken: true,
				username: "student@example.test",
			},
			where: { id: "moodle" },
		});
		await prisma.googleConnection.update({
			data: {
				connectedEmail: "student@example.test",
				driveRootFolderId: "root-folder-id",
				hasRefreshToken: true,
			},
			where: { id: "google" },
		});

		await clearMoodleCredentials(prisma);
		await clearGoogleConnection(prisma);

		expect(
			(
				await prisma.moodleConnection.findUniqueOrThrow({
					where: { id: "moodle" },
				})
			).credentialsSaved,
		).toBe(false);
		expect(
			(
				await prisma.googleConnection.findUniqueOrThrow({
					where: { id: "google" },
				})
			).hasRefreshToken,
		).toBe(false);
		expect(await getSecret(prisma, SECRET_KEYS.moodlePassword)).toBeNull();
		expect(await getSecret(prisma, SECRET_KEYS.googleRefreshToken)).toBeNull();
	});

	it("loads course and log snapshots with matching file counts", async () => {
		await prisma.moodleCourse.create({
			data: { fullName: "Databases", id: 42, shortName: "DB" },
		});
		await prisma.courseSyncConfig.create({
			data: {
				courseId: 42,
				enabled: true,
				extensionsCsv: "pdf,txt",
				useGlobalExtensions: false,
			},
		});
		await prisma.moodleSection.create({
			data: {
				courseId: 42,
				id: "42:1",
				name: "Week 1",
				sectionIndex: 1,
			},
		});
		await prisma.sectionSyncConfig.create({
			data: { sectionId: "42:1", selected: true },
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
		await prisma.moodleFile.createMany({
			data: [
				{
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
				{
					courseId: 42,
					fileKey: "file-2",
					filename: "notes.docx",
					fileSize: 1,
					fileUrl: "https://example.test/notes.docx",
					lastSeenAt: new Date(),
					moduleId: 100,
					moduleName: "Intro",
					sectionId: "42:1",
					sectionName: "Week 1",
					timeModified: 1,
				},
			],
		});
		await prisma.syncRun.create({
			data: {
				id: "run-1",
				status: "SUCCESS",
				trigger: "MANUAL",
			},
		});

		const courses = await loadCoursesSnapshot(prisma);
		const logs = await loadLogsSnapshot(prisma);

		expect(courses.courses).toHaveLength(1);
		expect(courses.courses[0]?.matchingFilesCount).toBe(1);
		expect(logs).toHaveLength(1);
	});

	it("updates course and section sync settings", async () => {
		await prisma.moodleCourse.create({
			data: { fullName: "Databases", id: 42, shortName: "DB" },
		});
		await prisma.courseSyncConfig.create({ data: { courseId: 42 } });
		await prisma.moodleSection.create({
			data: {
				courseId: 42,
				id: "42:1",
				name: "Week 1",
				sectionIndex: 1,
			},
		});
		await prisma.sectionSyncConfig.create({ data: { sectionId: "42:1" } });

		await updateCourseSyncConfig(prisma, {
			courseId: 42,
			enabled: true,
			extensions: ["pdf", "zip"],
			useGlobalExtensions: false,
		});
		await updateSectionSelection(prisma, "42:1", false);

		expect(
			(
				await prisma.courseSyncConfig.findUniqueOrThrow({
					where: { courseId: 42 },
				})
			).extensionsCsv,
		).toBe("pdf,zip");
		expect(
			(
				await prisma.courseSyncConfig.findUniqueOrThrow({
					where: { courseId: 42 },
				})
			).enabled,
		).toBe(true);
		expect(
			(
				await prisma.sectionSyncConfig.findUniqueOrThrow({
					where: { sectionId: "42:1" },
				})
			).selected,
		).toBe(false);
	});

	it("preserves existing course sync values on partial updates", async () => {
		await prisma.moodleCourse.create({
			data: { fullName: "Databases", id: 42, shortName: "DB" },
		});
		await prisma.courseSyncConfig.create({
			data: {
				courseId: 42,
				enabled: true,
				extensionsCsv: "pdf,zip",
				useGlobalExtensions: false,
			},
		});

		await updateCourseSyncConfig(prisma, {
			courseId: 42,
			useGlobalExtensions: true,
		});

		const config = await prisma.courseSyncConfig.findUniqueOrThrow({
			where: { courseId: 42 },
		});
		expect(config.enabled).toBe(true);
		expect(config.extensionsCsv).toBe("pdf,zip");
		expect(config.useGlobalExtensions).toBe(true);
	});

	it("loads course snapshots using global extensions", async () => {
		await saveGlobalExtensions(prisma, ["pdf"]);
		await prisma.moodleCourse.create({
			data: { fullName: "Databases", id: 42, shortName: "DB" },
		});
		await prisma.courseSyncConfig.create({
			data: { courseId: 42, enabled: true, useGlobalExtensions: true },
		});
		await prisma.moodleSection.create({
			data: { courseId: 42, id: "42:1", name: "Week 1", sectionIndex: 1 },
		});
		await prisma.sectionSyncConfig.create({
			data: { sectionId: "42:1", selected: true },
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

		const snapshot = await loadCoursesSnapshot(prisma);
		expect(snapshot.courses[0]?.matchingFilesCount).toBe(1);
	});
});
