import path from "node:path";

import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]);

export type AppEnv = ReturnType<typeof readEnv>;

export function readEnv(source: NodeJS.ProcessEnv = process.env) {
	const appDataDir = source.APP_DATA_DIR ?? path.join(process.cwd(), "data");
	const defaultDatabaseUrl = `file:${path.join(appDataDir, "app.db")}`;

	const parsed = z
		.object({
			APP_BASE_URL: z.url().default("http://127.0.0.1:3000"),
			APP_DATA_DIR: z.string().min(1).default(appDataDir),
			APP_SECRET_KEY: z.string().min(1).optional(),
			DATABASE_URL: z.string().min(1).default(defaultDatabaseUrl),
			ENABLE_IN_PROCESS_SCHEDULER: z
				.string()
				.optional()
				.transform((value) => value !== "false"),
			GOOGLE_CLIENT_ID: z.string().min(1).optional(),
			GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
			NODE_ENV: nodeEnvSchema.default("development"),
			SCHEDULER_TICK_SECONDS: z.coerce.number().int().positive().default(60),
		})
		.parse({
			APP_BASE_URL: source.APP_BASE_URL,
			APP_DATA_DIR: source.APP_DATA_DIR,
			APP_SECRET_KEY: source.APP_SECRET_KEY,
			DATABASE_URL: source.DATABASE_URL,
			ENABLE_IN_PROCESS_SCHEDULER: source.ENABLE_IN_PROCESS_SCHEDULER,
			GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
			NODE_ENV: source.NODE_ENV,
			SCHEDULER_TICK_SECONDS: source.SCHEDULER_TICK_SECONDS,
		});

	return {
		appBaseUrl: parsed.APP_BASE_URL,
		appDataDir: path.resolve(parsed.APP_DATA_DIR),
		appSecretKey: parsed.APP_SECRET_KEY,
		databaseUrl: parsed.DATABASE_URL,
		enableInProcessScheduler: parsed.ENABLE_IN_PROCESS_SCHEDULER,
		googleClientId: parsed.GOOGLE_CLIENT_ID,
		googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
		nodeEnv: parsed.NODE_ENV,
		schedulerTickSeconds: parsed.SCHEDULER_TICK_SECONDS,
	};
}
