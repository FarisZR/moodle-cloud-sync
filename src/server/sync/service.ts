import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
	appendLogLine,
	formatDriveFileName,
	matchesExtension,
} from "~/server/core";
import type { AppEnv } from "~/server/env";
import { readEnv } from "~/server/env";
import { createGoogleDriveClient } from "~/server/google/client";
import {
	ensureDriveRootFolder,
	withGoogleAccessToken,
} from "~/server/google/service";
import { createMoodleClient } from "~/server/moodle/client";
import {
	refreshMoodleMetadata,
	withMoodleToken,
} from "~/server/moodle/service";
import { ensureAppDirectories } from "~/server/paths";
import type { SecretStore } from "~/server/secrets";
import type { PrismaClient } from "../../generated/prisma/client";
import { SyncRunStatus, SyncTrigger } from "../../generated/prisma/enums";

type SyncGoogleClient = {
	ensureFolder(input: {
		accessToken: string;
		name: string;
		parentId?: string;
	}): Promise<{ id: string; name: string; url: string }>;
	refreshAccessToken(input: {
		clientId: string;
		clientSecret: string;
		refreshToken: string;
	}): Promise<{ accessToken: string; expiresIn: number; tokenType: string }>;
	uploadFile(input: {
		accessToken: string;
		content: Buffer;
		mimeType: string;
		name: string;
		parentId: string;
	}): Promise<{ id: string; name: string; url: string }>;
	updateFile(input: {
		accessToken: string;
		content: Buffer;
		fileId: string;
		mimeType: string;
		name: string;
	}): Promise<{ id: string; name: string; url: string }>;
};

type SyncMoodleClient = {
	authenticateWithCredentials(input: {
		organization: string;
		password: string;
		username: string;
	}): Promise<{
		passport: string;
		privateToken: string | null;
		wstoken: string;
	}>;
	downloadFile(fileUrl: string, wstoken: string): Promise<Buffer>;
	getCourseContents(wstoken: string, courseId: number): Promise<unknown>;
	getCourses(wstoken: string, userId: number): Promise<unknown>;
	getSiteInfo(wstoken: string): Promise<unknown>;
};

type SyncDependencies = {
	createGoogleClient?: () => SyncGoogleClient;
	createMoodleClient?: (baseUrl: string) => SyncMoodleClient;
	now?: () => Date;
	runIdFactory?: () => string;
	scopeCourseId?: number;
};

type SyncSummary = {
	filesDiscovered: number;
	filesFailed: number;
	filesSkipped: number;
	filesUpdated: number;
	filesUploaded: number;
	status: keyof typeof SyncRunStatus;
};

async function createRun(
	prisma: PrismaClient,
	trigger: SyncTrigger,
	runId: string,
	scopeCourseId?: number,
) {
	return prisma.$transaction(async (tx) => {
		const app = await tx.appSetting.findUniqueOrThrow({ where: { id: "app" } });

		if (app.activeRunStatus === SyncRunStatus.RUNNING) {
			throw new Error("A sync is already running");
		}

		await tx.syncRun.create({
			data: {
				id: runId,
				logText: appendLogLine("", "Starting sync"),
				scopeCourseId,
				status: SyncRunStatus.RUNNING,
				trigger,
			},
		});
		await tx.appSetting.update({
			data: {
				activeRunId: runId,
				activeRunProcessed: 0,
				activeRunStatus: SyncRunStatus.RUNNING,
				cancelRequestedAt: null,
				lastError: null,
			},
			where: { id: "app" },
		});
	});
}

async function appendRunLog(
	prisma: PrismaClient,
	runId: string,
	message: string,
	data?: {
		activeRunCourseId?: number | null;
		activeRunCourseName?: string | null;
		activeRunProcessed?: number;
	},
) {
	const current = await prisma.syncRun.findUniqueOrThrow({
		where: { id: runId },
	});
	const nextLog = appendLogLine(current.logText, message);

	await prisma.syncRun.update({
		data: { logText: nextLog },
		where: { id: runId },
	});
	await prisma.appSetting.update({
		data: {
			activeRunCourseId: data?.activeRunCourseId ?? undefined,
			activeRunCourseName: data?.activeRunCourseName ?? undefined,
			activeRunMessage: message,
			activeRunProcessed: data?.activeRunProcessed ?? undefined,
		},
		where: { id: "app" },
	});
}

async function finishRun(
	prisma: PrismaClient,
	env: AppEnv,
	runId: string,
	result: SyncSummary,
	errorMessage?: string,
) {
	const current = await prisma.syncRun.findUniqueOrThrow({
		where: { id: runId },
	});
	const finalLog = appendLogLine(
		current.logText,
		result.status === "CANCELLED" ? "Sync cancelled" : "Sync complete",
	);

	await prisma.syncRun.update({
		data: {
			errorMessage: errorMessage ?? null,
			filesDiscovered: result.filesDiscovered,
			filesFailed: result.filesFailed,
			filesSkipped: result.filesSkipped,
			filesUpdated: result.filesUpdated,
			filesUploaded: result.filesUploaded,
			finishedAt: new Date(),
			logText: finalLog,
			status: SyncRunStatus[result.status],
		},
		where: { id: runId },
	});
	await prisma.appSetting.update({
		data: {
			activeRunCourseId: null,
			activeRunCourseName: null,
			activeRunId: null,
			activeRunMessage: null,
			activeRunProcessed: 0,
			activeRunStatus: SyncRunStatus.IDLE,
			cancelRequestedAt: null,
			lastError: errorMessage ?? null,
		},
		where: { id: "app" },
	});

	const paths = await ensureAppDirectories(env);
	await fs.writeFile(`${paths.logsDir}/${runId}.log`, finalLog, "utf8");
}

export async function requestSyncCancellation(prisma: PrismaClient) {
	await prisma.appSetting.update({
		data: { cancelRequestedAt: new Date() },
		where: { id: "app" },
	});
}

async function isCancellationRequested(prisma: PrismaClient) {
	const app = await prisma.appSetting.findUniqueOrThrow({
		where: { id: "app" },
	});
	return app.cancelRequestedAt !== null;
}

export async function runMetadataRefresh(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
	dependencies: Pick<
		SyncDependencies,
		"createMoodleClient" | "runIdFactory"
	> = {},
) {
	const runId = dependencies.runIdFactory?.() ?? randomUUID();
	await createRun(prisma, SyncTrigger.METADATA_REFRESH, runId);

	try {
		await appendRunLog(prisma, runId, "Refreshing Moodle metadata");
		await refreshMoodleMetadata(
			prisma,
			secretStore,
			env,
			dependencies.createMoodleClient,
		);
		const result = {
			filesDiscovered: 0,
			filesFailed: 0,
			filesSkipped: 0,
			filesUpdated: 0,
			filesUploaded: 0,
			status: "SUCCESS" as const,
		};
		await finishRun(prisma, env, runId, result);
		return result;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Metadata refresh failed";
		const result = {
			filesDiscovered: 0,
			filesFailed: 0,
			filesSkipped: 0,
			filesUpdated: 0,
			filesUploaded: 0,
			status: "FAILED" as const,
		};
		await finishRun(prisma, env, runId, result, message);
		return result;
	}
}

export async function runSync(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
	dependencies: SyncDependencies = {},
) {
	const googleClientFactory =
		dependencies.createGoogleClient ?? (() => createGoogleDriveClient());
	const moodleClientFactory =
		dependencies.createMoodleClient ??
		((baseUrl: string) => createMoodleClient({ baseUrl }));
	const runId = dependencies.runIdFactory?.() ?? randomUUID();
	const now = dependencies.now ?? (() => new Date());
	await createRun(
		prisma,
		SyncTrigger.MANUAL,
		runId,
		dependencies.scopeCourseId,
	);

	const counts = {
		filesDiscovered: 0,
		filesFailed: 0,
		filesSkipped: 0,
		filesUpdated: 0,
		filesUploaded: 0,
	};

	try {
		await appendRunLog(prisma, runId, "Refreshing Moodle metadata");
		await refreshMoodleMetadata(prisma, secretStore, env, moodleClientFactory);
		await appendRunLog(prisma, runId, "Ensuring Google Drive root folder");
		const rootFolder = await ensureDriveRootFolder(
			prisma,
			secretStore,
			env,
			googleClientFactory,
		);

		const app = await prisma.appSetting.findUniqueOrThrow({
			where: { id: "app" },
		});
		const globalExtensions = app.globalExtensionsCsv
			? app.globalExtensionsCsv.split(",").filter(Boolean)
			: ["pdf"];

		const courses = await prisma.moodleCourse.findMany({
			include: {
				driveFolder: true,
				files: true,
				sections: { include: { syncConfig: true } },
				syncConfig: true,
			},
			orderBy: { fullName: "asc" },
		});

		for (const course of courses) {
			if (
				dependencies.scopeCourseId !== undefined &&
				course.id !== dependencies.scopeCourseId
			) {
				continue;
			}

			const config = course.syncConfig;

			if (!config?.enabled) {
				continue;
			}

			if (await isCancellationRequested(prisma)) {
				const result = { ...counts, status: "CANCELLED" as const };
				await finishRun(prisma, env, runId, result);
				return result;
			}

			await appendRunLog(prisma, runId, `Syncing course: ${course.fullName}`, {
				activeRunCourseId: course.id,
				activeRunCourseName: course.fullName,
			});

			const courseFolder = course.driveFolder
				? {
						id: course.driveFolder.folderId,
						name: course.fullName,
						url: course.driveFolder.folderUrl,
					}
				: await withGoogleAccessToken(
						prisma,
						secretStore,
						env,
						googleClientFactory,
						(api, accessToken) =>
							api.ensureFolder({
								accessToken,
								name: course.fullName,
								parentId: rootFolder.id,
							}),
					);

			await prisma.driveFolder.upsert({
				create: {
					courseId: course.id,
					folderId: courseFolder.id,
					folderUrl: courseFolder.url,
					lastVerifiedAt: now(),
				},
				update: {
					folderId: courseFolder.id,
					folderUrl: courseFolder.url,
					lastVerifiedAt: now(),
				},
				where: { courseId: course.id },
			});

			const selectedSectionIds = new Set(
				course.sections
					.filter((section) => section.syncConfig?.selected !== false)
					.map((section) => section.id),
			);
			const allowedExtensions = config.useGlobalExtensions
				? globalExtensions
				: config.extensionsCsv.split(",").filter(Boolean);
			const matchingFiles = course.files.filter(
				(file) =>
					selectedSectionIds.has(file.sectionId) &&
					matchesExtension(file.filename, allowedExtensions),
			);
			const usedNames = new Set<string>();

			counts.filesDiscovered += matchingFiles.length;
			await prisma.courseSyncConfig.update({
				data: { lastMatchingFileCount: matchingFiles.length },
				where: { courseId: course.id },
			});
			await appendRunLog(
				prisma,
				runId,
				`Found ${matchingFiles.length} matching files`,
			);

			for (const file of matchingFiles) {
				if (await isCancellationRequested(prisma)) {
					const result = { ...counts, status: "CANCELLED" as const };
					await finishRun(prisma, env, runId, result);
					return result;
				}

				const existing = await prisma.syncedFile.findUnique({
					where: { fileKey: file.fileKey },
				});
				if (
					existing &&
					existing.fileSize === file.fileSize &&
					existing.moodleTimeModified === file.timeModified
				) {
					counts.filesSkipped += 1;
					await appendRunLog(
						prisma,
						runId,
						`Skipped unchanged: ${file.filename}`,
					);
					continue;
				}

				try {
					const content = await withMoodleToken(
						prisma,
						secretStore,
						env,
						(api, wstoken) => api.downloadFile(file.fileUrl, wstoken),
						{ createClient: moodleClientFactory },
					);
					const sha256 = createHash("sha256").update(content).digest("hex");

					if (existing?.sha256 === sha256) {
						counts.filesSkipped += 1;
						await prisma.syncedFile.update({
							data: {
								fileSize: file.fileSize,
								moodleTimeModified: file.timeModified,
								syncedAt: now(),
							},
							where: { fileKey: file.fileKey },
						});
						await appendRunLog(
							prisma,
							runId,
							`Skipped unchanged: ${file.filename}`,
						);
						continue;
					}

					const driveName = formatDriveFileName({
						filename: file.filename,
						moduleName: file.moduleName,
						sectionName: file.sectionName,
						stableFileKey: file.fileKey,
						usedNames,
					});

					const driveFile = existing
						? await withGoogleAccessToken(
								prisma,
								secretStore,
								env,
								googleClientFactory,
								(api, accessToken) =>
									api.updateFile({
										accessToken,
										content,
										fileId: existing.driveFileId,
										mimeType: file.mimeType ?? "application/octet-stream",
										name: driveName,
									}),
							)
						: await withGoogleAccessToken(
								prisma,
								secretStore,
								env,
								googleClientFactory,
								(api, accessToken) =>
									api.uploadFile({
										accessToken,
										content,
										mimeType: file.mimeType ?? "application/octet-stream",
										name: driveName,
										parentId: courseFolder.id,
									}),
							);

					await prisma.syncedFile.upsert({
						create: {
							driveFileId: driveFile.id,
							driveFileName: driveName,
							fileKey: file.fileKey,
							fileSize: file.fileSize,
							moodleTimeModified: file.timeModified,
							sha256,
							syncedAt: now(),
						},
						update: {
							driveFileId: driveFile.id,
							driveFileName: driveName,
							fileSize: file.fileSize,
							moodleTimeModified: file.timeModified,
							sha256,
							syncedAt: now(),
						},
						where: { fileKey: file.fileKey },
					});

					if (existing) {
						counts.filesUpdated += 1;
						await appendRunLog(prisma, runId, `Updated: ${driveName}`);
					} else {
						counts.filesUploaded += 1;
						await appendRunLog(prisma, runId, `Uploaded: ${driveName}`);
					}
				} catch (error) {
					counts.filesFailed += 1;
					await appendRunLog(
						prisma,
						runId,
						`Failed: ${file.filename} (${error instanceof Error ? error.message : "Unknown error"})`,
					);
				}
			}

			await prisma.courseSyncConfig.update({
				data: {
					lastSyncAt: now(),
					lastSyncStatus:
						counts.filesFailed > 0
							? SyncRunStatus.PARTIAL
							: SyncRunStatus.SUCCESS,
				},
				where: { courseId: course.id },
			});
		}

		const status =
			counts.filesFailed > 0
				? counts.filesUploaded > 0 ||
					counts.filesUpdated > 0 ||
					counts.filesSkipped > 0
					? "PARTIAL"
					: "FAILED"
				: "SUCCESS";
		const result = { ...counts, status } as SyncSummary;
		await finishRun(prisma, env, runId, result);
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Sync failed";
		const result = { ...counts, status: "FAILED" as const };
		await finishRun(prisma, env, runId, result, message);
		return result;
	}
}
