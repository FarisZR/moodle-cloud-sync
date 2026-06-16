import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readEnv } from "~/server/env";
import { runSchedulerTick } from "~/server/scheduler";
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
		await createTestDatabase("scheduler-"));
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await destroyTestDatabase({ databaseDir, prisma });
});

describe("scheduler", () => {
	it("does nothing when scheduling is disabled", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		const runSyncSpy = vi.fn();

		const result = await runSchedulerTick(prisma, secretStore, env, {
			now: new Date("2026-06-14T00:30:00.000Z"),
			runSync: runSyncSpy,
		});

		expect(result).toEqual({ status: "disabled" });
		expect(runSyncSpy).not.toHaveBeenCalled();
	});

	it("runs scheduled sync when due", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveScheduleSettings(prisma, {
			enabled: true,
			time: "02:00",
			timezone: "Europe/Berlin",
		});
		const runSyncSpy = vi.fn(async () => ({
			filesDiscovered: 1,
			filesFailed: 0,
			filesSkipped: 0,
			filesUpdated: 0,
			filesUploaded: 1,
			status: "SUCCESS" as const,
		}));

		const result = await runSchedulerTick(prisma, secretStore, env, {
			now: new Date("2026-06-14T00:30:00.000Z"),
			runSync: runSyncSpy,
		});

		expect(result.status).toBe("triggered");
		expect(runSyncSpy).toHaveBeenCalledTimes(1);
		const runSyncCalls = runSyncSpy.mock.calls as unknown as Array<
			[unknown, unknown, unknown, unknown]
		>;
		expect(runSyncCalls[0]?.[3]).toEqual(
			expect.objectContaining({ trigger: "SCHEDULED" }),
		);
	});

	it("does not rerun after a scheduled sync has already run for the slot", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveScheduleSettings(prisma, {
			enabled: true,
			time: "02:00",
			timezone: "Europe/Berlin",
		});
		await prisma.syncRun.create({
			data: {
				id: "scheduled-run",
				logText: "done",
				startedAt: new Date("2026-06-14T00:05:00.000Z"),
				status: "SUCCESS",
				trigger: "SCHEDULED",
			},
		});
		const runSyncSpy = vi.fn();

		const result = await runSchedulerTick(prisma, secretStore, env, {
			now: new Date("2026-06-14T00:30:00.000Z"),
			runSync: runSyncSpy,
		});

		expect(result).toEqual({ status: "not_due" });
		expect(runSyncSpy).not.toHaveBeenCalled();
	});

	it("skips when another sync is already active", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveScheduleSettings(prisma, {
			enabled: true,
			time: "02:00",
			timezone: "Europe/Berlin",
		});
		await prisma.appSetting.update({
			data: { activeRunStatus: "RUNNING" },
			where: { id: "app" },
		});

		const result = await runSchedulerTick(prisma, secretStore, env, {
			now: new Date("2026-06-14T00:30:00.000Z"),
			runSync: vi.fn(),
		});

		expect(result).toEqual({ status: "busy" });
	});
});
