import type { NextRequest } from "next/server";

import { db } from "~/server/db";
import { readEnv } from "~/server/env";
import { runSchedulerTick } from "~/server/scheduler";
import { createSecretStore } from "~/server/secrets";

export async function POST(_request: NextRequest) {
	const env = readEnv();
	const secretStore = await createSecretStore(db, env);
	const result = await runSchedulerTick(db, secretStore, env);

	return Response.json(result);
}
