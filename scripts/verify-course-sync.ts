import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createPrismaClient } from "~/server/db";
import { readEnv } from "~/server/env";
import {
	refreshMoodleMetadata,
	saveMoodleCredentials,
	testMoodleConnection,
} from "~/server/moodle/service";
import { ensureAppDirectories } from "~/server/paths";
import { createSecretStore } from "~/server/secrets";
import {
	ensureSingletonRows,
	updateCourseSyncConfig,
	updateSectionSelection,
} from "~/server/store";
import { requestSyncCancellation, runSync } from "~/server/sync/service";

type MoodleSecrets = {
	baseUrl: string;
	organization: string;
	password: string;
	username: string;
};

function parseMoodleSecrets(text: string): MoodleSecrets {
	const values = new Map<string, string>();

	for (const line of text.split(/\r?\n/).filter(Boolean)) {
		const index = line.indexOf(":");
		if (index === -1) {
			continue;
		}

		values.set(
			line.slice(0, index).trim().toLowerCase(),
			line.slice(index + 1).trim(),
		);
	}

	const baseUrl = values.get("base url") ?? "https://moodle.dhbw.de/";
	const organization = values.get("organization");
	const username = values.get("username/email");
	const password = values.get("password");

	if (!(organization && username && password)) {
		throw new Error("Missing fields in secrets/moodle.txt");
	}

	return { baseUrl, organization, password, username };
}

async function main() {
	const env = readEnv();
	await ensureAppDirectories(env);
	execFileSync("pnpm", ["exec", "prisma", "db", "push"], {
		cwd: process.cwd(),
		env: { ...process.env, DATABASE_URL: env.databaseUrl },
		stdio: "pipe",
	});
	const db = createPrismaClient(env.databaseUrl);
	await ensureSingletonRows(db);
	const secretStore = await createSecretStore(db, env);
	const secrets = parseMoodleSecrets(
		await fs.readFile(
			path.join(process.cwd(), "secrets", "moodle.txt"),
			"utf8",
		),
	);

	await saveMoodleCredentials(db, secretStore, secrets);
	await testMoodleConnection(db, secretStore, env);
	await refreshMoodleMetadata(db, secretStore, env);

	const course = await db.moodleCourse.findFirst({
		where: {
			OR: [
				{ id: 44 },
				{
					fullName: {
						contains: "KA-Alle aktuellen Kurse der Informatik",
					},
				},
				{
					shortName: {
						contains: "KA-Alle aktuellen Kurse der Informatik",
					},
				},
			],
		},
		include: { sections: true },
	});

	if (!course) {
		throw new Error(
			"Course 'KA-Alle aktuellen Kurse der Informatik' was not found",
		);
	}

	await updateCourseSyncConfig(db, {
		courseId: course.id,
		enabled: true,
		useGlobalExtensions: true,
	});

	for (const section of course.sections) {
		const selected = section.name === "Diverse Unterlagen";
		await updateSectionSelection(db, section.id, selected);
	}

	const result = await runSync(db, secretStore, env, {
		runIdFactory: () => `verify-course-sync-${randomUUID()}`,
		scopeCourseId: course.id,
	});

	const refreshedCourse = await db.moodleCourse.findUniqueOrThrow({
		where: { id: course.id },
		include: {
			files: true,
			sections: { include: { syncConfig: true } },
			syncConfig: true,
		},
	});

	console.log(
		JSON.stringify(
			{
				courseId: refreshedCourse.id,
				course: refreshedCourse.fullName,
				filesDiscovered: result.filesDiscovered,
				filesFailed: result.filesFailed,
				filesSkipped: result.filesSkipped,
				filesUpdated: result.filesUpdated,
				filesUploaded: result.filesUploaded,
				sections: refreshedCourse.sections.map((section) => ({
					name: section.name,
					selected: section.syncConfig?.selected !== false,
				})),
				status: result.status,
			},
			null,
			2,
		),
	);

	await requestSyncCancellation(db).catch(() => undefined);
	await db.$disconnect();
}

await main();
