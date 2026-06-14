import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	vi.resetModules();
	({ databaseDir, databaseUrl, prisma } = await createTestDatabase(
		"app-state-defaults-",
	));
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await destroyTestDatabase({ databaseDir, prisma });
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("app-state defaults", () => {
	it("handles disabled schedules on the dashboard and default background task runners", async () => {
		vi.doMock("~/server/sync/service", () => ({
			runMetadataRefresh: vi.fn(async (_prisma, _secretStore, _env, deps) => {
				deps?.runIdFactory?.();
				return {
					filesDiscovered: 0,
					filesFailed: 0,
					filesSkipped: 0,
					filesUpdated: 0,
					filesUploaded: 0,
					status: "SUCCESS" as const,
				};
			}),
			runSync: vi.fn(async (_prisma, _secretStore, _env, deps) => {
				deps?.runIdFactory?.();
				return {
					filesDiscovered: 0,
					filesFailed: 0,
					filesSkipped: 0,
					filesUpdated: 0,
					filesUploaded: 0,
					status: "SUCCESS" as const,
				};
			}),
		}));

		const {
			loadDashboardPageData,
			startMetadataRefreshTask,
			startSyncTask,
			waitForBackgroundTasks,
		} = await import("~/server/app-state");
		const secretStore = await createSecretStore(
			prisma,
			readEnv({
				APP_DATA_DIR: path.join(databaseDir, "data"),
				APP_SECRET_KEY: "test-secret",
				DATABASE_URL: databaseUrl,
				NODE_ENV: "test",
			}),
		);

		await saveScheduleSettings(prisma, {
			enabled: false,
			time: "02:00",
			timezone: "Europe/Berlin",
		});

		const dashboard = await loadDashboardPageData(
			prisma,
			new Date("2026-06-14T00:30:00.000Z"),
		);
		expect(dashboard.nextScheduledRun).toBeNull();

		await startSyncTask(prisma, secretStore, readEnv(), {});
		await startMetadataRefreshTask(prisma, secretStore, readEnv(), {});
		await waitForBackgroundTasks();
	});
});
