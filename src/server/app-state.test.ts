import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadCoursesPageData,
	loadDashboardPageData,
	loadLogsPageData,
	loadSetupPageData,
	startMetadataRefreshTask,
	startSyncTask,
	waitForBackgroundTasks,
} from "~/server/app-state";
import { readEnv } from "~/server/env";
import { createSecretStore } from "~/server/secrets";
import { ensureSingletonRows, saveScheduleSettings } from "~/server/store";
import {
	createTestDatabase,
	destroyTestDatabase,
} from "../../tests/support/database";

let databaseDir = "";
let databaseUrl = "";
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];

beforeEach(async () => {
	({ databaseDir, databaseUrl, prisma } =
		await createTestDatabase("app-state-"));
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await waitForBackgroundTasks();
	await destroyTestDatabase({ databaseDir, prisma });
});

describe("app state", () => {
	it("loads dashboard page data with next scheduled run", async () => {
		await saveScheduleSettings(prisma, {
			enabled: true,
			time: "02:00",
			timezone: "Europe/Berlin",
		});
		await prisma.syncRun.create({
			data: { id: "run-1", status: "SUCCESS", trigger: "MANUAL" },
		});

		const data = await loadDashboardPageData(
			prisma,
			new Date("2026-06-14T00:30:00.000Z"),
		);

		expect(data.recentRuns).toHaveLength(1);
		expect(data.nextScheduledRun?.toISOString()).toBe(
			"2026-06-15T00:00:00.000Z",
		);
	});

	it("loads setup, courses, and logs page data", async () => {
		await prisma.googleDeviceFlow.create({
			data: {
				deviceCode: "device-code",
				userCode: "ABCD-EFGH",
				verificationUrl: "https://www.google.com/device",
				intervalSeconds: 5,
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		await prisma.syncRun.create({
			data: { id: "run-1", status: "SUCCESS", trigger: "MANUAL" },
		});
		await prisma.moodleCourse.create({
			data: { fullName: "Databases", id: 42, shortName: "DB" },
		});
		await prisma.courseSyncConfig.create({ data: { courseId: 42 } });

		const setup = await loadSetupPageData(prisma);
		const courses = await loadCoursesPageData(prisma);
		const logs = await loadLogsPageData(prisma);

		expect(setup.googleDeviceFlow?.userCode).toBe("ABCD-EFGH");
		expect(courses.courses).toHaveLength(1);
		expect(logs.runs).toHaveLength(1);
	});

	it("starts background sync and metadata tasks", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		const syncSpy = vi.fn(async () => ({
			filesDiscovered: 0,
			filesFailed: 0,
			filesSkipped: 0,
			filesUpdated: 0,
			filesUploaded: 0,
			status: "SUCCESS" as const,
		}));
		const metadataSpy = vi.fn(async () => ({
			filesDiscovered: 0,
			filesFailed: 0,
			filesSkipped: 0,
			filesUpdated: 0,
			filesUploaded: 0,
			status: "SUCCESS" as const,
		}));

		const syncRunId = await startSyncTask(prisma, secretStore, env, {
			runSync: syncSpy,
			scopeCourseId: 42,
		});
		const metadataRunId = await startMetadataRefreshTask(
			prisma,
			secretStore,
			env,
			{
				runMetadataRefresh: metadataSpy,
			},
		);

		expect(syncRunId).not.toBe(metadataRunId);
		await waitForBackgroundTasks();
		expect(syncSpy).toHaveBeenCalledTimes(1);
		expect(metadataSpy).toHaveBeenCalledTimes(1);
	});
});
