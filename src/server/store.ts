import {
	DEFAULT_GLOBAL_EXTENSIONS,
	DEFAULT_MOODLE_BASE_URL,
	DEFAULT_MOODLE_ORGANIZATION,
	DEFAULT_SCHEDULE_TIME,
	DEFAULT_SCHEDULE_TIMEZONE,
	extensionsToCsv,
	matchesExtension,
	normalizeBaseUrl,
	parseExtensionsInput,
} from "~/server/core";
import { type PrismaClient, SyncRunStatus } from "../generated/prisma/client";

export const SECRET_KEYS = {
	googleClientSecret: "google.clientSecret",
	googleRefreshToken: "google.refreshToken",
	moodlePassword: "moodle.password",
	moodlePrivateToken: "moodle.privatetoken",
	moodleWSToken: "moodle.wstoken",
} as const;

export async function ensureSingletonRows(prisma: PrismaClient) {
	await prisma.appSetting.upsert({
		create: {
			globalExtensionsCsv: extensionsToCsv(DEFAULT_GLOBAL_EXTENSIONS),
			scheduleTime: DEFAULT_SCHEDULE_TIME,
			scheduleTimezone: DEFAULT_SCHEDULE_TIMEZONE,
		},
		update: {},
		where: { id: "app" },
	});

	await prisma.moodleConnection.upsert({
		create: {
			baseUrl: DEFAULT_MOODLE_BASE_URL,
			organization: DEFAULT_MOODLE_ORGANIZATION,
		},
		update: {},
		where: { id: "moodle" },
	});

	await prisma.googleConnection.upsert({
		create: {},
		update: {},
		where: { id: "google" },
	});
}

export async function putSecret(
	prisma: PrismaClient,
	key: string,
	value: string,
) {
	await prisma.secret.upsert({
		create: { key, value },
		update: { value },
		where: { key },
	});
}

export async function getSecret(prisma: PrismaClient, key: string) {
	const secret = await prisma.secret.findUnique({ where: { key } });
	return secret?.value ?? null;
}

export async function deleteSecret(prisma: PrismaClient, key: string) {
	await prisma.secret.deleteMany({ where: { key } });
}

export async function saveMoodleSettings(
	prisma: PrismaClient,
	input: {
		baseUrl: string;
		organization: string;
		username: string;
	},
) {
	await ensureSingletonRows(prisma);

	await prisma.moodleConnection.update({
		data: {
			baseUrl: normalizeBaseUrl(input.baseUrl),
			credentialsSaved: true,
			hasToken: false,
			lastError: null,
			organization: input.organization.trim(),
			tokenUpdatedAt: null,
			username: input.username.trim(),
		},
		where: { id: "moodle" },
	});

	await prisma.secret.deleteMany({
		where: {
			key: {
				in: [SECRET_KEYS.moodlePrivateToken, SECRET_KEYS.moodleWSToken],
			},
		},
	});
}

export async function saveGoogleClientSettings(
	prisma: PrismaClient,
	input: { clientId: string; hasClientSecret: boolean },
) {
	await ensureSingletonRows(prisma);

	await prisma.googleConnection.update({
		data: {
			clientId: input.clientId.trim(),
			clientSecretSaved: input.hasClientSecret,
			lastError: null,
		},
		where: { id: "google" },
	});
}

export async function loadDashboardSnapshot(prisma: PrismaClient) {
	await ensureSingletonRows(prisma);

	const [app, google, lastRun, moodle] = await Promise.all([
		prisma.appSetting.findUniqueOrThrow({ where: { id: "app" } }),
		prisma.googleConnection.findUniqueOrThrow({ where: { id: "google" } }),
		prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
		prisma.moodleConnection.findUniqueOrThrow({ where: { id: "moodle" } }),
	]);

	return {
		app,
		google,
		lastRun,
		moodle,
		isSyncRunning: app.activeRunStatus === SyncRunStatus.RUNNING,
	};
}

export async function clearMoodleCredentials(prisma: PrismaClient) {
	await prisma.moodleConnection.update({
		data: {
			credentialsSaved: false,
			hasToken: false,
			lastError: null,
			lastSuccessAt: null,
			tokenUpdatedAt: null,
			username: null,
		},
		where: { id: "moodle" },
	});

	await prisma.secret.deleteMany({
		where: {
			key: {
				in: [
					SECRET_KEYS.moodlePassword,
					SECRET_KEYS.moodlePrivateToken,
					SECRET_KEYS.moodleWSToken,
				],
			},
		},
	});
}

export async function clearGoogleConnection(prisma: PrismaClient) {
	await prisma.googleConnection.update({
		data: {
			connectedEmail: null,
			driveRootFolderId: null,
			driveRootFolderUrl: null,
			hasRefreshToken: false,
			lastError: null,
			lastSuccessAt: null,
		},
		where: { id: "google" },
	});

	await prisma.secret.deleteMany({
		where: {
			key: {
				in: [SECRET_KEYS.googleRefreshToken],
			},
		},
	});
}

export async function saveScheduleSettings(
	prisma: PrismaClient,
	input: {
		enabled: boolean;
		time: string;
		timezone: string;
	},
) {
	await prisma.appSetting.update({
		data: {
			scheduleEnabled: input.enabled,
			scheduleTime: input.time,
			scheduleTimezone: input.timezone,
		},
		where: { id: "app" },
	});
}

export async function saveGlobalExtensions(
	prisma: PrismaClient,
	extensions: string[],
) {
	await prisma.appSetting.update({
		data: {
			globalExtensionsCsv: extensionsToCsv(extensions),
		},
		where: { id: "app" },
	});
}

export async function updateCourseSyncConfig(
	prisma: PrismaClient,
	input: {
		courseId: number;
		enabled?: boolean;
		extensions?: string[];
		useGlobalExtensions?: boolean;
	},
) {
	const current =
		(await prisma.courseSyncConfig.findUnique({
			where: { courseId: input.courseId },
		})) ??
		(await prisma.courseSyncConfig.create({
			data: { courseId: input.courseId },
		}));

	await prisma.courseSyncConfig.update({
		data: {
			enabled: input.enabled ?? current.enabled,
			extensionsCsv:
				input.extensions !== undefined
					? extensionsToCsv(input.extensions)
					: current.extensionsCsv,
			useGlobalExtensions:
				input.useGlobalExtensions ?? current.useGlobalExtensions,
		},
		where: { courseId: input.courseId },
	});
}

export async function updateSectionSelection(
	prisma: PrismaClient,
	sectionId: string,
	selected: boolean,
) {
	await prisma.sectionSyncConfig.update({
		data: { selected },
		where: { sectionId },
	});
}

export async function loadCoursesSnapshot(prisma: PrismaClient) {
	const app = await prisma.appSetting.findUniqueOrThrow({
		where: { id: "app" },
	});
	const courses = await prisma.moodleCourse.findMany({
		include: {
			driveFolder: true,
			files: true,
			sections: { include: { syncConfig: true } },
			syncConfig: true,
		},
		orderBy: { fullName: "asc" },
	});
	const globalExtensions = parseExtensionsInput(app.globalExtensionsCsv);

	return {
		courses: courses.map((course) => {
			const config = course.syncConfig;
			const activeExtensions = config?.useGlobalExtensions
				? globalExtensions
				: parseExtensionsInput(config?.extensionsCsv ?? "");
			const selectedSections = course.sections.filter(
				(section) => section.syncConfig?.selected !== false,
			);
			const matchingFiles = course.files.filter(
				(file) =>
					selectedSections.some((section) => section.id === file.sectionId) &&
					matchesExtension(file.filename, activeExtensions),
			);

			return {
				course,
				matchingFilesCount: matchingFiles.length,
				selectedSectionsCount: selectedSections.length,
			};
		}),
		globalExtensions,
	};
}

export async function loadLogsSnapshot(prisma: PrismaClient) {
	return prisma.syncRun.findMany({
		orderBy: { startedAt: "desc" },
		take: 25,
	});
}
