import { db } from "~/server/db";
import { readEnv } from "~/server/env";
import { runSchedulerTick } from "~/server/scheduler";
import { createSecretStore } from "~/server/secrets";

const globalSchedulerState = globalThis as {
	schedulerStarted?: boolean;
	schedulerTimer?: NodeJS.Timeout;
};

async function startScheduler() {
	if (globalSchedulerState.schedulerStarted) {
		return;
	}

	const env = readEnv();

	if (!env.enableInProcessScheduler) {
		return;
	}

	globalSchedulerState.schedulerStarted = true;
	const secretStore = await createSecretStore(db, env);

	const tick = async () => {
		try {
			await runSchedulerTick(db, secretStore, env);
		} catch (error) {
			console.error("scheduler tick failed", error);
		}
	};

	void tick();
	globalSchedulerState.schedulerTimer = setInterval(
		() => void tick(),
		env.schedulerTickSeconds * 1000,
	);
}

void startScheduler();
