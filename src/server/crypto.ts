import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import fs from "node:fs/promises";

import type { AppEnv } from "~/server/env";
import { readEnv } from "~/server/env";
import { ensureAppDirectories, resolveAppPaths } from "~/server/paths";

function toEncryptionKey(secret: string) {
	return createHash("sha256").update(secret).digest();
}

export async function loadAppEncryptionKey(env: AppEnv = readEnv()) {
	if (env.appSecretKey) {
		return toEncryptionKey(env.appSecretKey);
	}

	const paths = await ensureAppDirectories(env);

	try {
		const existing = await fs.readFile(paths.secretKeyPath, "utf8");
		return toEncryptionKey(existing.trim());
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!("code" in error) ||
			error.code !== "ENOENT"
		) {
			throw error;
		}
	}

	const generated = randomBytes(32).toString("base64url");
	await fs.writeFile(paths.secretKeyPath, `${generated}\n`, { mode: 0o600 });
	return toEncryptionKey(generated);
}

export async function ensureSecretKeyFile(env: AppEnv = readEnv()) {
	await loadAppEncryptionKey(env);
	return resolveAppPaths(env).secretKeyPath;
}

export function encryptSecret(value: string, key: Buffer) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return [
		iv.toString("base64url"),
		tag.toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

export function decryptSecret(payload: string, key: Buffer) {
	const [ivText, tagText, encryptedText] = payload.split(".");

	if (!(ivText && tagText && encryptedText)) {
		throw new Error("Invalid encrypted secret payload");
	}

	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		Buffer.from(ivText, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tagText, "base64url"));

	return Buffer.concat([
		decipher.update(Buffer.from(encryptedText, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
