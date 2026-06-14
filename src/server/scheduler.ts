import { isScheduleDue } from "~/server/core";
import type { AppEnv } from "~/server/env";
import { readEnv } from "~/server/env";
import type { SecretStore } from "~/server/secrets";
import { runSync } from "~/server/sync/service";
import type { PrismaClient } from "../generated/prisma/client";

export async function runSchedulerTick(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
	options: {
		now?: Date;
		runSync?: typeof runSync;
	} = {},
) {
	const app = await prisma.appSetting.findUniqueOrThrow({
		where: { id: "app" },
	});

	if (!app.scheduleEnabled) {
		return { status: "disabled" as const };
	}

	if (app.activeRunStatus === "RUNNING") {
		return { status: "busy" as const };
	}

	const lastRun = await prisma.syncRun.findFirst({
		orderBy: { startedAt: "desc" },
		where: { trigger: "SCHEDULED" },
	});

	if (
		!isScheduleDue({
			currentInstant: options.now ?? new Date(),
			lastRunAt: lastRun?.startedAt ?? null,
			time: app.scheduleTime,
			timezone: app.scheduleTimezone,
		})
	) {
		return { status: "not_due" as const };
	}

	await (options.runSync ?? runSync)(prisma, secretStore, env, {
		runIdFactory: undefined,
	});

	return { status: "triggered" as const };
}
