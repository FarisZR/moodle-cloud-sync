"use server";

import { revalidatePath } from "next/cache";
import { startMetadataRefreshTask, startSyncTask } from "~/server/app-state";
import { db } from "~/server/db";
import { readEnv } from "~/server/env";
import {
	pollGoogleDeviceFlow,
	saveGoogleClientCredentials,
	startGoogleDeviceFlow,
} from "~/server/google/service";
import {
	saveMoodleCredentials,
	testMoodleConnection,
} from "~/server/moodle/service";
import { createSecretStore } from "~/server/secrets";
import {
	clearGoogleConnection,
	clearMoodleCredentials,
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

export async function saveMoodleCredentialsAction(formData: FormData) {
	const secretStore = await createSecretStore(db, readEnv());
	await saveMoodleCredentials(db, secretStore, {
		baseUrl: String(formData.get("baseUrl") ?? ""),
		organization: String(formData.get("organization") ?? ""),
		password: String(formData.get("password") ?? ""),
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
	await testMoodleConnection(db, secretStore, readEnv());
	revalidateApp();
}

export async function saveGoogleClientCredentialsAction(formData: FormData) {
	const secretStore = await createSecretStore(db, readEnv());
	await saveGoogleClientCredentials(db, secretStore, {
		clientId: String(formData.get("clientId") ?? ""),
		clientSecret: String(formData.get("clientSecret") ?? ""),
	});
	revalidateApp();
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
	await pollGoogleDeviceFlow(db, secretStore, readEnv());
	revalidateApp();
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
	await updateCourseSyncConfig(db, {
		courseId: Number(formData.get("courseId")),
		enabled: formData.get("enabled") === "on",
		extensions: String(formData.get("extensions") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		useGlobalExtensions: formData.get("useGlobalExtensions") === "on",
	});
	revalidatePath("/courses");
	revalidatePath("/");
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
