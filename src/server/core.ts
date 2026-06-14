import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";

export const DEFAULT_GLOBAL_EXTENSIONS = ["pdf"];
export const DEFAULT_MOODLE_BASE_URL = "https://moodle.dhbw.de/";
export const DEFAULT_MOODLE_ORGANIZATION = "dh-karlsruhe.de";
export const DEFAULT_SCHEDULE_TIME = "02:00";
export const DEFAULT_SCHEDULE_TIMEZONE = "Europe/Berlin";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_ROOT_FOLDER_NAME = "Moodle Study Sync";
export const MOODLE_MOBILE_USER_AGENT =
	"Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 MoodleMobile";

export function normalizeBaseUrl(url: string) {
	return url.endsWith("/") ? url : `${url}/`;
}

export function normalizeExtension(value: string) {
	return value.trim().replace(/^\./, "").toLowerCase();
}

export function parseExtensionsInput(value: string) {
	const unique = new Set<string>();

	for (const item of value.split(",")) {
		const normalized = normalizeExtension(item);

		if (normalized) {
			unique.add(normalized);
		}
	}

	return [...unique];
}

export function extensionsToCsv(extensions: string[]) {
	return parseExtensionsInput(extensions.join(",")).join(",");
}

export function matchesExtension(
	filename: string,
	allowedExtensions: string[],
) {
	const normalizedAllowed = new Set(allowedExtensions.map(normalizeExtension));
	const extension = filename.includes(".")
		? normalizeExtension(filename.slice(filename.lastIndexOf(".")))
		: "";

	return extension !== "" && normalizedAllowed.has(extension);
}

export function createStableFileKey(input: {
	courseId: number;
	fileUrlOrPath: string;
	filename: string;
	moduleId: number;
	sectionId: string;
}) {
	const value = [
		input.courseId,
		input.sectionId,
		input.moduleId,
		input.fileUrlOrPath,
		input.filename,
	].join(":::");

	return createHash("sha256").update(value).digest("hex");
}

export function formatDriveFileName(input: {
	filename: string;
	moduleName: string;
	sectionName: string;
	stableFileKey: string;
	usedNames?: Set<string>;
}) {
	const base = [input.sectionName, input.moduleName, input.filename]
		.map((value) => value.trim())
		.filter(Boolean)
		.join(" - ");

	if (!input.usedNames?.has(base)) {
		input.usedNames?.add(base);
		return base;
	}

	const dotIndex = base.lastIndexOf(".");
	const suffix = input.stableFileKey.slice(0, 6);
	const withSuffix =
		dotIndex === -1
			? `${base}-${suffix}`
			: `${base.slice(0, dotIndex)}-${suffix}${base.slice(dotIndex)}`;

	input.usedNames.add(withSuffix);
	return withSuffix;
}

export function computeNextScheduledRun(
	currentInstant: Date | string,
	time: string,
	timezone: string,
) {
	const [hourText, minuteText] = time.split(":");
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const now = Temporal.Instant.from(
		currentInstant instanceof Date
			? currentInstant.toISOString()
			: currentInstant,
	);
	const zonedNow = now.toZonedDateTimeISO(timezone);
	let nextRun = Temporal.ZonedDateTime.from({
		year: zonedNow.year,
		month: zonedNow.month,
		day: zonedNow.day,
		hour,
		minute,
		timeZone: timezone,
	});

	if (Temporal.ZonedDateTime.compare(nextRun, zonedNow) <= 0) {
		nextRun = nextRun.add({ days: 1 });
	}

	return new Date(nextRun.toInstant().epochMilliseconds);
}

export function isScheduleDue(input: {
	currentInstant: Date | string;
	lastRunAt?: Date | string | null;
	time: string;
	timezone: string;
}) {
	const nextRun = computeNextScheduledRun(
		input.currentInstant,
		input.time,
		input.timezone,
	);

	if (!input.lastRunAt) {
		return true;
	}

	const lastRun = new Date(input.lastRunAt);
	const previousSlot = new Date(nextRun);
	previousSlot.setDate(previousSlot.getDate() - 1);

	return lastRun < previousSlot;
}

export function appendLogLine(existingLog: string, message: string) {
	const timestamp = new Date().toISOString();
	const line = `${timestamp} [INFO] ${message}`;

	return existingLog ? `${existingLog}\n${line}` : line;
}
