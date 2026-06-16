import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "~/server/env";
import {
	refreshMoodleMetadata,
	saveMoodleCredentials,
	testMoodleConnection,
	updateStoredMoodleTokens,
	withMoodleToken,
} from "~/server/moodle/service";
import { createSecretStore, resolveMoodleCredentials } from "~/server/secrets";
import { ensureSingletonRows, SECRET_KEYS } from "~/server/store";
import {
	createTestDatabase,
	destroyTestDatabase,
} from "../../../tests/support/database";

let databaseDir = "";
let databaseUrl = "";
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];

beforeEach(async () => {
	({ databaseDir, databaseUrl, prisma } =
		await createTestDatabase("moodle-service-"));
	await ensureSingletonRows(prisma);
});

afterEach(async () => {
	await destroyTestDatabase({ databaseDir, prisma });
});

describe("moodle service", () => {
	it("saves encrypted moodle credentials", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);

		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});

		expect(await resolveMoodleCredentials(prisma, secretStore)).toEqual({
			baseUrl: "https://moodle.example.test/",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
	});

	it("tests moodle login and stores returned tokens", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});

		const createClient = vi.fn(() => ({
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: "private-token",
				wstoken: "ws-token",
			})),
			getSiteInfo: vi.fn(async () => ({ fullname: "Student", userid: 7 })),
		}));

		const result = await testMoodleConnection(
			prisma,
			secretStore,
			env,
			createClient,
		);

		expect(result).toEqual({ fullname: "Student", userid: 7 });
		expect(await secretStore.get(SECRET_KEYS.moodleWSToken)).toBe("ws-token");
		expect(await secretStore.get(SECRET_KEYS.moodlePrivateToken)).toBe(
			"private-token",
		);
	});

	it("records moodle test failures for the UI", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});

		await expect(
			testMoodleConnection(prisma, secretStore, env, () => ({
				authenticateWithCredentials: vi.fn(async () => {
					throw new Error("Moodle is rate limiting requests.");
				}),
				getSiteInfo: vi.fn(),
			})),
		).rejects.toThrow("Moodle is rate limiting requests.");

		await expect(
			prisma.moodleConnection.findUniqueOrThrow({ where: { id: "moodle" } }),
		).resolves.toEqual(
			expect.objectContaining({
				lastError: "Moodle is rate limiting requests.",
			}),
		);
	});

	it("refreshes course metadata into sqlite", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await updateStoredMoodleTokens(prisma, secretStore, {
			privateToken: "private-token",
			wstoken: "ws-token",
		});

		const createClient = vi.fn(() => ({
			authenticateWithCredentials: vi.fn(),
			getCourseContents: vi.fn(async () => [
				{
					id: 101,
					modules: [
						{
							contents: [
								{
									filename: "intro.pdf",
									filepath: "/",
									filesize: 120,
									fileurl:
										"https://moodle.example.test/pluginfile.php/1/intro.pdf",
									mimetype: "application/pdf",
									timemodified: 1700000000,
								},
							],
							id: 201,
							modname: "resource",
							name: "Intro",
							uservisible: true,
							visible: 1,
						},
					],
					name: "Week 1",
					section: 1,
					uservisible: true,
					visible: 1,
				},
			]),
			getCourses: vi.fn(async () => [
				{
					fullName: "Databases",
					fullname: "Databases",
					id: 42,
					shortname: "DB",
					visible: 1,
				},
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		}));

		await refreshMoodleMetadata(prisma, secretStore, env, createClient);

		expect(await prisma.moodleCourse.findMany()).toHaveLength(1);
		expect(await prisma.moodleSection.findMany()).toHaveLength(1);
		expect(await prisma.moodleModule.findMany()).toHaveLength(1);
		expect(await prisma.moodleFile.findMany()).toHaveLength(1);
		expect(await prisma.courseSyncConfig.findMany()).toHaveLength(1);
		expect(await prisma.sectionSyncConfig.findMany()).toHaveLength(1);
	});

	it("refreshes only requested course contents when scoped", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await updateStoredMoodleTokens(prisma, secretStore, {
			privateToken: "private-token",
			wstoken: "ws-token",
		});

		const getCourseContents = vi.fn(async () => []);
		const createClient = vi.fn(() => ({
			authenticateWithCredentials: vi.fn(),
			getCourseContents,
			getCourses: vi.fn(async () => [
				{
					fullname: "Databases",
					id: 42,
					shortname: "DB",
					visible: 1,
				},
				{
					fullname: "Networks",
					id: 43,
					shortname: "NET",
					visible: 1,
				},
			]),
			getSiteInfo: vi.fn(async () => ({
				siteurl: "https://moodle.example.test",
				userid: 7,
			})),
		}));

		const result = await refreshMoodleMetadata(
			prisma,
			secretStore,
			env,
			createClient,
			{ courseIds: [42] },
		);

		expect(result.courseCount).toBe(1);
		expect(getCourseContents).toHaveBeenCalledTimes(1);
		expect(getCourseContents).toHaveBeenCalledWith("ws-token", 42);
		expect(await prisma.moodleCourse.findMany()).toEqual([
			expect.objectContaining({ id: 42, shortName: "DB" }),
		]);
	});

	it("reauthenticates when moodle token is rejected once", async () => {
		const env = readEnv({
			APP_DATA_DIR: path.join(databaseDir, "data"),
			APP_SECRET_KEY: "test-secret",
			DATABASE_URL: databaseUrl,
			NODE_ENV: "test",
		});
		const secretStore = await createSecretStore(prisma, env);
		await saveMoodleCredentials(prisma, secretStore, {
			baseUrl: "https://moodle.example.test",
			organization: "example.org",
			password: "secret-password",
			username: "student@example.test",
		});
		await updateStoredMoodleTokens(prisma, secretStore, {
			privateToken: null,
			wstoken: "stale-token",
		});

		const getSiteInfo = vi
			.fn()
			.mockRejectedValueOnce({ errorCode: "invalidtoken", message: "invalid" })
			.mockResolvedValueOnce({
				siteurl: "https://moodle.example.test",
				userid: 7,
			});

		const client = {
			authenticateWithCredentials: vi.fn(async () => ({
				passport: "passport-123",
				privateToken: null,
				wstoken: "fresh-token",
			})),
			getSiteInfo,
		};

		const createClient = vi.fn(() => client);
		const result = await withMoodleToken(
			prisma,
			secretStore,
			env,
			(api, token) => api.getSiteInfo(token),
			{ createClient },
		);

		expect(result).toEqual({
			siteurl: "https://moodle.example.test",
			userid: 7,
		});
		expect(client.authenticateWithCredentials).toHaveBeenCalledTimes(1);
		expect(await secretStore.get(SECRET_KEYS.moodleWSToken)).toBe(
			"fresh-token",
		);
	});
});
