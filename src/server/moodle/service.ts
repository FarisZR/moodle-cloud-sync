import type { AppEnv } from "~/server/env";
import { createMoodleClient } from "~/server/moodle/client";
import { mapCourseContents } from "~/server/moodle/mapper";
import type { SecretStore } from "~/server/secrets";
import { resolveMoodleCredentials } from "~/server/secrets";
import { SECRET_KEYS, saveMoodleSettings } from "~/server/store";
import type { PrismaClient } from "../../generated/prisma/client";
import { SyncRunStatus } from "../../generated/prisma/enums";

type Awaitable<T> = Promise<T> | T;

type MoodleAuthClient = {
	authenticateWithCredentials(input: {
		organization: string;
		password: string;
		username: string;
	}): Promise<{
		passport: string;
		privateToken: string | null;
		wstoken: string;
	}>;
	getSiteInfo(wstoken: string): Promise<unknown>;
};

type MoodleMetadataClient = MoodleAuthClient & {
	getCourseContents(wstoken: string, courseId: number): Promise<unknown>;
	getCourses(wstoken: string, userId: number): Promise<unknown>;
};

export async function saveMoodleCredentials(
	prisma: PrismaClient,
	secretStore: SecretStore,
	input: {
		baseUrl: string;
		organization: string;
		password: string;
		username: string;
	},
) {
	await saveMoodleSettings(prisma, {
		baseUrl: input.baseUrl,
		organization: input.organization,
		username: input.username,
	});
	await secretStore.set(SECRET_KEYS.moodlePassword, input.password);
}

export async function updateStoredMoodleTokens(
	prisma: PrismaClient,
	secretStore: SecretStore,
	input: { privateToken: string | null; wstoken: string },
) {
	await secretStore.set(SECRET_KEYS.moodleWSToken, input.wstoken);

	if (input.privateToken) {
		await secretStore.set(SECRET_KEYS.moodlePrivateToken, input.privateToken);
	} else {
		await secretStore.delete(SECRET_KEYS.moodlePrivateToken);
	}

	await prisma.moodleConnection.update({
		data: {
			hasToken: true,
			lastError: null,
			lastSuccessAt: new Date(),
			tokenUpdatedAt: new Date(),
		},
		where: { id: "moodle" },
	});
}

export async function testMoodleConnection(
	prisma: PrismaClient,
	secretStore: SecretStore,
	_env: AppEnv,
	createClient: (baseUrl: string) => MoodleAuthClient = (baseUrl) =>
		createMoodleClient({ baseUrl }),
) {
	const credentials = await resolveMoodleCredentials(prisma, secretStore);

	if (!(credentials.password && credentials.username)) {
		throw new Error("Moodle credentials are incomplete");
	}

	const client = createClient(credentials.baseUrl);
	const token = await client.authenticateWithCredentials({
		organization: credentials.organization,
		password: credentials.password,
		username: credentials.username,
	});

	await updateStoredMoodleTokens(prisma, secretStore, token);

	const siteInfo = await client.getSiteInfo(token.wstoken);

	await prisma.moodleConnection.update({
		data: {
			lastError: null,
			lastSuccessAt: new Date(),
			lastTestedAt: new Date(),
		},
		where: { id: "moodle" },
	});

	return siteInfo;
}

export async function withMoodleToken<T, TClient extends MoodleAuthClient>(
	prisma: PrismaClient,
	secretStore: SecretStore,
	_env: AppEnv,
	callback: (api: TClient, wstoken: string) => Awaitable<T>,
	options?: {
		createClient?: (baseUrl: string) => TClient;
	},
) {
	const clientFactory =
		options?.createClient ??
		((baseUrl: string) =>
			createMoodleClient({ baseUrl }) as unknown as TClient);
	const credentials = await resolveMoodleCredentials(prisma, secretStore);

	if (!(credentials.password && credentials.username)) {
		throw new Error("Moodle credentials are incomplete");
	}

	const client = clientFactory(credentials.baseUrl);
	let wstoken = await secretStore.get(SECRET_KEYS.moodleWSToken);

	if (!wstoken) {
		const refreshed = await client.authenticateWithCredentials({
			organization: credentials.organization,
			password: credentials.password,
			username: credentials.username,
		});

		await updateStoredMoodleTokens(prisma, secretStore, refreshed);
		wstoken = refreshed.wstoken;
	}

	try {
		return await callback(client, wstoken);
	} catch (error) {
		const errorCode =
			typeof error === "object" && error && "errorCode" in error
				? String(error.errorCode)
				: null;

		if (errorCode !== "invalidtoken") {
			throw error;
		}

		const refreshed = await client.authenticateWithCredentials({
			organization: credentials.organization,
			password: credentials.password,
			username: credentials.username,
		});

		await updateStoredMoodleTokens(prisma, secretStore, refreshed);
		return await callback(client, refreshed.wstoken);
	}
}

export async function refreshMoodleMetadata<
	TClient extends MoodleMetadataClient,
>(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv,
	createClient?: (baseUrl: string) => TClient,
	options: { courseIds?: number[] } = {},
) {
	const clientFactory =
		createClient ??
		((baseUrl: string) =>
			createMoodleClient({ baseUrl }) as unknown as TClient);
	return withMoodleToken(
		prisma,
		secretStore,
		env,
		async (client, wstoken) => {
			const siteInfo = (await client.getSiteInfo(wstoken)) as {
				userid: number;
			};
			const courses = (await client.getCourses(
				wstoken,
				siteInfo.userid,
			)) as Array<{
				fullname?: string;
				fullName?: string;
				id: number;
				shortname: string;
				visible?: boolean | number;
			}>;
			const courseIds =
				options.courseIds && options.courseIds.length > 0
					? new Set(options.courseIds)
					: null;
			let refreshedCourseCount = 0;

			for (const course of courses) {
				if (courseIds && !courseIds.has(course.id)) {
					continue;
				}
				refreshedCourseCount += 1;

				await prisma.moodleCourse.upsert({
					create: {
						fullName: course.fullname ?? course.fullName ?? course.shortname,
						id: course.id,
						shortName: course.shortname,
						visible:
							typeof course.visible === "number"
								? course.visible === 1
								: (course.visible ?? null),
					},
					update: {
						fullName: course.fullname ?? course.fullName ?? course.shortname,
						lastMetadataRefreshAt: new Date(),
						shortName: course.shortname,
						visible:
							typeof course.visible === "number"
								? course.visible === 1
								: (course.visible ?? null),
					},
					where: { id: course.id },
				});
				await prisma.courseSyncConfig.upsert({
					create: { courseId: course.id },
					update: {},
					where: { courseId: course.id },
				});

				const contents = await client.getCourseContents(wstoken, course.id);
				const mapped = mapCourseContents(course.id, contents as never[]);

				for (const section of mapped.sections) {
					await prisma.moodleSection.upsert({
						create: section,
						update: section,
						where: { id: section.id },
					});
					await prisma.sectionSyncConfig.upsert({
						create: { sectionId: section.id },
						update: {},
						where: { sectionId: section.id },
					});
				}

				for (const module of mapped.modules) {
					await prisma.moodleModule.upsert({
						create: module,
						update: module,
						where: { id: module.id },
					});
				}

				for (const file of mapped.files) {
					await prisma.moodleFile.upsert({
						create: file,
						update: file,
						where: { fileKey: file.fileKey },
					});
				}
			}

			await prisma.moodleConnection.update({
				data: {
					lastError: null,
					lastSuccessAt: new Date(),
				},
				where: { id: "moodle" },
			});

			return {
				courseCount: refreshedCourseCount,
				status: SyncRunStatus.SUCCESS,
			};
		},
		{ createClient: clientFactory },
	);
}
