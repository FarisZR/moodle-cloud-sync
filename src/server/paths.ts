import fs from "node:fs/promises";
import path from "node:path";

import type { AppEnv } from "~/server/env";
import { readEnv } from "~/server/env";

export type AppPaths = ReturnType<typeof resolveAppPaths>;

export function resolveAppPaths(env: AppEnv = readEnv()) {
	const appDataDir = env.appDataDir;

	return {
		appDataDir,
		databasePath: path.join(appDataDir, "app.db"),
		logsDir: path.join(appDataDir, "logs"),
		secretKeyPath: path.join(appDataDir, "secret.key"),
		tempDir: path.join(appDataDir, "temp"),
	};
}

export async function ensureAppDirectories(env: AppEnv = readEnv()) {
	const paths = resolveAppPaths(env);

	await Promise.all([
		fs.mkdir(paths.appDataDir, { recursive: true }),
		fs.mkdir(paths.logsDir, { recursive: true }),
		fs.mkdir(paths.tempDir, { recursive: true }),
	]);

	return paths;
}
