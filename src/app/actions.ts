"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SECRET_PLACEHOLDER } from "~/lib/secret-placeholder";
import { startMetadataRefreshTask, startSyncTask } from "~/server/app-state";
import { db } from "~/server/db";
import { readEnv } from "~/server/env";
import {
	pollGoogleDeviceFlow,
	saveGoogleClientCredentials,
	startGoogleDeviceFlow,
	testGoogleClientCredentials,
} from "~/server/google/service";
import {
	saveMoodleCredentials,
	testMoodleConnection,
} from "~/server/moodle/service";
import { createSecretStore } from "~/server/secrets";
import {
	clearGoogleConnection,
	clearMoodleCredentials,
	SECRET_KEYS,
	saveGlobalExtensions,
	saveScheduleSettings,
	updateCourseSyncConfig,
	updateSectionSelection,
} from "~/server/store";
import { requestSyncCancellation } from "~/server/sync/service";

function revalidateApp() {
	revalidatePath("/");
	revalidatePath("/setup");
	revalidatePath("/courses");
	revalidatePath("/logs");
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Unexpected error";
}

async function resolveSubmittedSecret(
	secretStore: Awaited<ReturnType<typeof createSecretStore>>,
	key: string,
	value: string,
	fallback?: string,
) {
	if (value === SECRET_PLACEHOLDER) {
		return fallback ?? (await secretStore.get(key)) ?? "";
	}

	return value;
}

export async function saveMoodleCredentialsAction(formData: FormData) {
	const secretStore = await createSecretStore(db, readEnv());
	await saveMoodleCredentials(db, secretStore, {
		baseUrl: String(formData.get("baseUrl") ?? ""),
		organization: String(formData.get("organization") ?? ""),
		password: await resolveSubmittedSecret(
			secretStore,
			SECRET_KEYS.moodlePassword,
			String(formData.get("password") ?? ""),
		),
		username: String(formData.get("username") ?? ""),
	});
	revalidateApp();
}

export async function clearMoodleCredentialsAction() {
	await clearMoodleCredentials(db);
	revalidateApp();
}

export async function testMoodleConnectionAction() {
	const secretStore = await createSecretStore(db, readEnv());
	let target = "/setup?moodleTest=success";
	try {
		await testMoodleConnection(db, secretStore, readEnv());
	} catch (error) {
		target = `/setup?moodleTest=error&moodleMessage=${encodeURIComponent(getErrorMessage(error))}`;
	}
	revalidateApp();
	redirect(target);
}

export async function saveGoogleClientCredentialsAction(formData: FormData) {
	const env = readEnv();
	const secretStore = await createSecretStore(db, env);
	await saveGoogleClientCredentials(db, secretStore, {
		clientId: String(formData.get("clientId") ?? ""),
		clientSecret: await resolveSubmittedSecret(
			secretStore,
			SECRET_KEYS.googleClientSecret,
			String(formData.get("clientSecret") ?? ""),
			env.googleClientSecret,
		),
	});
	revalidateApp();
}

export async function testGoogleClientCredentialsAction(formData: FormData) {
	const env = readEnv();
	const secretStore = await createSecretStore(db, env);
	const clientId = String(formData.get("clientId") ?? "");
	const clientSecret = await resolveSubmittedSecret(
		secretStore,
		SECRET_KEYS.googleClientSecret,
		String(formData.get("clientSecret") ?? ""),
		env.googleClientSecret,
	);
	let target = "/setup?googleTest=success";
	try {
		await testGoogleClientCredentials({ clientId, clientSecret });
		await saveGoogleClientCredentials(db, secretStore, {
			clientId,
			clientSecret,
		});
	} catch (error) {
		target = `/setup?googleTest=error&googleMessage=${encodeURIComponent(getErrorMessage(error))}`;
	}
	revalidateApp();
	redirect(target);
}

export async function clearGoogleConnectionAction() {
	await clearGoogleConnection(db);
	revalidateApp();
}

export async function startGoogleDeviceFlowAction() {
	const secretStore = await createSecretStore(db, readEnv());
	await startGoogleDeviceFlow(db, secretStore, readEnv());
	revalidateApp();
}

export async function pollGoogleDeviceFlowAction() {
	const secretStore = await createSecretStore(db, readEnv());
	let target = "/setup?googleVerify=success";
	try {
		const result = await pollGoogleDeviceFlow(db, secretStore, readEnv());
		target =
			result.status === "approved"
				? "/setup?googleVerify=success"
				: `/setup?googleVerify=${encodeURIComponent(result.status)}`;
	} catch (error) {
		target = `/setup?googleVerify=error&googleMessage=${encodeURIComponent(getErrorMessage(error))}`;
	}
	revalidateApp();
	redirect(target);
}

export async function saveScheduleAction(formData: FormData) {
	await saveScheduleSettings(db, {
		enabled: formData.get("enabled") === "on",
		time: String(formData.get("time") ?? "02:00"),
		timezone: String(formData.get("timezone") ?? "Europe/Berlin"),
	});
	await saveGlobalExtensions(
		db,
		String(formData.get("globalExtensions") ?? "pdf")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	);
	revalidateApp();
}

export async function updateCourseConfigAction(formData: FormData) {
	const courseId = Number(formData.get("courseId"));
	const enabled = formData.get("enabled") === "on";

	await updateCourseSyncConfig(db, {
		courseId,
		enabled,
		extensions: String(formData.get("extensions") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		useGlobalExtensions: formData.get("useGlobalExtensions") === "on",
	});
	revalidatePath("/courses");
	revalidatePath("/");

	if (enabled) {
		redirect(`/courses?expandedCourse=${courseId}`);
	}
}

export async function updateSectionSelectionAction(formData: FormData) {
	await updateSectionSelection(
		db,
		String(formData.get("sectionId") ?? ""),
		formData.get("selected") === "on",
	);
	revalidatePath("/courses");
}

export async function startSyncAction() {
	const secretStore = await createSecretStore(db, readEnv());
	await startSyncTask(db, secretStore, readEnv());
	revalidateApp();
}

export async function startCourseSyncAction(formData: FormData) {
	const secretStore = await createSecretStore(db, readEnv());
	await startSyncTask(db, secretStore, readEnv(), {
		scopeCourseId: Number(formData.get("courseId")),
	});
	revalidateApp();
}

export async function refreshMetadataAction() {
	const secretStore = await createSecretStore(db, readEnv());
	await startMetadataRefreshTask(db, secretStore, readEnv());
	revalidateApp();
}

export async function cancelSyncAction() {
	await requestSyncCancellation(db);
	revalidateApp();
}
