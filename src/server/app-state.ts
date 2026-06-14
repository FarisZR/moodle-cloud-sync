import { randomUUID } from "node:crypto";

import { computeNextScheduledRun } from "~/server/core";
import type { AppEnv } from "~/server/env";
import { readEnv } from "~/server/env";
import type { SecretStore } from "~/server/secrets";
import {
	ensureSingletonRows,
	loadCoursesSnapshot,
	loadDashboardSnapshot,
	loadLogsSnapshot,
} from "~/server/store";
import { runMetadataRefresh, runSync } from "~/server/sync/service";
import type { PrismaClient } from "../generated/prisma/client";

type BackgroundTaskMap = Map<string, Promise<unknown>>;

const globalForBackgroundTasks = globalThis as {
	backgroundTasks?: BackgroundTaskMap;
};

const backgroundTasks =
	globalForBackgroundTasks.backgroundTasks ??
	new Map<string, Promise<unknown>>();

globalForBackgroundTasks.backgroundTasks = backgroundTasks;

function trackBackgroundTask(runId: string, promise: Promise<unknown>) {
	backgroundTasks.set(
		runId,
		promise.finally(() => {
			backgroundTasks.delete(runId);
		}),
	);
}

export async function loadDashboardPageData(
	prisma: PrismaClient,
	now = new Date(),
) {
	await ensureSingletonRows(prisma);
	const [snapshot, recentRuns] = await Promise.all([
		loadDashboardSnapshot(prisma),
		prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
	]);

	return {
		...snapshot,
		nextScheduledRun: snapshot.app.scheduleEnabled
			? computeNextScheduledRun(
					now,
					snapshot.app.scheduleTime,
					snapshot.app.scheduleTimezone,
				)
			: null,
		recentRuns,
	};
}

export async function loadSetupPageData(prisma: PrismaClient) {
	await ensureSingletonRows(prisma);
	const [app, google, googleDeviceFlow, moodle] = await Promise.all([
		prisma.appSetting.findUniqueOrThrow({ where: { id: "app" } }),
		prisma.googleConnection.findUniqueOrThrow({ where: { id: "google" } }),
		prisma.googleDeviceFlow.findUnique({ where: { id: "google-device-flow" } }),
		prisma.moodleConnection.findUniqueOrThrow({ where: { id: "moodle" } }),
	]);

	return {
		app,
		google,
		googleDeviceFlow,
		moodle,
	};
}

export async function loadCoursesPageData(prisma: PrismaClient) {
	await ensureSingletonRows(prisma);
	return loadCoursesSnapshot(prisma);
}

export async function loadLogsPageData(prisma: PrismaClient) {
	await ensureSingletonRows(prisma);
	const [app, runs] = await Promise.all([
		prisma.appSetting.findUniqueOrThrow({ where: { id: "app" } }),
		loadLogsSnapshot(prisma),
	]);

	return { app, runs };
}

export async function startSyncTask(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
	options: {
		runSync?: typeof runSync;
		scopeCourseId?: number;
	} = {},
) {
	const runId = randomUUID();
	trackBackgroundTask(
		runId,
		(options.runSync ?? runSync)(prisma, secretStore, env, {
			runIdFactory: () => runId,
			scopeCourseId: options.scopeCourseId,
		}),
	);
	return runId;
}

export async function startMetadataRefreshTask(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
	options: { runMetadataRefresh?: typeof runMetadataRefresh } = {},
) {
	const runId = randomUUID();
	trackBackgroundTask(
		runId,
		(options.runMetadataRefresh ?? runMetadataRefresh)(
			prisma,
			secretStore,
			env,
			{
				runIdFactory: () => runId,
			},
		),
	);
	return runId;
}

export async function waitForBackgroundTasks() {
	await Promise.allSettled([...backgroundTasks.values()]);
}
