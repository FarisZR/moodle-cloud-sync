import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { readEnv } from "~/server/env";
import { PrismaClient } from "../generated/prisma/client";

export function createPrismaClient(databaseUrl = readEnv().databaseUrl) {
	const env = readEnv();
	const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

	return new PrismaClient({
		adapter,
		log: env.nodeEnv === "development" ? ["query", "error", "warn"] : ["error"],
	});
}

const globalForPrisma = globalThis as {
	prisma?: PrismaClient;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (readEnv().nodeEnv !== "production") {
	globalForPrisma.prisma = db;
}
