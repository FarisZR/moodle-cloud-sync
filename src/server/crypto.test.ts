import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	decryptSecret,
	encryptSecret,
	ensureSecretKeyFile,
	loadAppEncryptionKey,
} from "~/server/crypto";
import { readEnv } from "~/server/env";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((entry) => fs.rm(entry, { force: true, recursive: true })),
	);
});

describe("secret encryption", () => {
	it("round-trips encrypted values", async () => {
		const env = readEnv({
			APP_DATA_DIR: await createTempDir(),
			APP_SECRET_KEY: "test-secret",
			NODE_ENV: "test",
		});
		const key = await loadAppEncryptionKey(env);
		const encrypted = encryptSecret("hello", key);

		expect(decryptSecret(encrypted, key)).toBe("hello");
	});

	it("persists a generated key when env key is missing", async () => {
		const dir = await createTempDir();
		const env = readEnv({ APP_DATA_DIR: dir, NODE_ENV: "test" });
		const first = await loadAppEncryptionKey(env);
		const second = await loadAppEncryptionKey(env);

		expect(first.equals(second)).toBe(true);
		const file = await fs.readFile(path.join(dir, "secret.key"), "utf8");
		expect(file.trim()).not.toBe("");
	});

	it("rejects invalid payloads", async () => {
		const env = readEnv({
			APP_DATA_DIR: await createTempDir(),
			APP_SECRET_KEY: "test-secret",
			NODE_ENV: "test",
		});
		const key = await loadAppEncryptionKey(env);

		expect(() => decryptSecret("nope", key)).toThrow(
			"Invalid encrypted secret payload",
		);
	});

	it("ensures the secret key file exists", async () => {
		const dir = await createTempDir();
		const env = readEnv({ APP_DATA_DIR: dir, NODE_ENV: "test" });

		expect(await ensureSecretKeyFile(env)).toBe(path.join(dir, "secret.key"));
	});

	it("rethrows non-ENOENT secret key read errors", async () => {
		const dir = await createTempDir();
		await fs.mkdir(path.join(dir, "secret.key"));
		const env = readEnv({ APP_DATA_DIR: dir, NODE_ENV: "test" });

		await expect(loadAppEncryptionKey(env)).rejects.toMatchObject({
			code: "EISDIR",
		});
	});
});

async function createTempDir() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "moodle-sync-crypto-"));
	tempDirs.push(dir);
	return dir;
}
