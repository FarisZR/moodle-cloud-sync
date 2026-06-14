import {
	decryptSecret,
	encryptSecret,
	loadAppEncryptionKey,
} from "~/server/crypto";
import type { AppEnv } from "~/server/env";
import { readEnv } from "~/server/env";
import {
	deleteSecret,
	getSecret,
	putSecret,
	SECRET_KEYS,
} from "~/server/store";
import type { PrismaClient } from "../generated/prisma/client";

export class SecretStore {
	constructor(
		private readonly prisma: PrismaClient,
		private readonly encryptionKey: Promise<Buffer>,
	) {}

	async delete(key: string) {
		await deleteSecret(this.prisma, key);
	}

	async get(key: string) {
		const value = await getSecret(this.prisma, key);

		if (!value) {
			return null;
		}

		return decryptSecret(value, await this.encryptionKey);
	}

	async set(key: string, value: string) {
		await putSecret(
			this.prisma,
			key,
			encryptSecret(value, await this.encryptionKey),
		);
	}
}

export async function createSecretStore(
	prisma: PrismaClient,
	env: AppEnv = readEnv(),
) {
	return new SecretStore(prisma, loadAppEncryptionKey(env));
}

export async function resolveGoogleClientCredentials(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
) {
	const connection = await prisma.googleConnection.findUnique({
		where: { id: "google" },
	});

	return {
		clientId: env.googleClientId ?? connection?.clientId ?? null,
		clientSecret:
			env.googleClientSecret ??
			(await secretStore.get(SECRET_KEYS.googleClientSecret)),
	};
}

export async function resolveMoodleCredentials(
	prisma: PrismaClient,
	secretStore: SecretStore,
) {
	const connection = await prisma.moodleConnection.findUniqueOrThrow({
		where: { id: "moodle" },
	});

	return {
		baseUrl: connection.baseUrl,
		organization: connection.organization,
		password: await secretStore.get(SECRET_KEYS.moodlePassword),
		username: connection.username,
	};
}
