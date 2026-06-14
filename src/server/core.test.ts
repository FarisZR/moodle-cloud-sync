import { describe, expect, it } from "vitest";

import {
	appendLogLine,
	computeNextScheduledRun,
	createStableFileKey,
	DEFAULT_GLOBAL_EXTENSIONS,
	extensionsToCsv,
	formatDriveFileName,
	isScheduleDue,
	matchesExtension,
	normalizeBaseUrl,
	parseExtensionsInput,
} from "~/server/core";

describe("core helpers", () => {
	it("normalizes urls and extensions", () => {
		expect(normalizeBaseUrl("https://example.com")).toBe(
			"https://example.com/",
		);
		expect(normalizeBaseUrl("https://example.com/")).toBe(
			"https://example.com/",
		);
		expect(parseExtensionsInput(" PDF, .pptx, pdf ,zip ")).toEqual([
			"pdf",
			"pptx",
			"zip",
		]);
		expect(extensionsToCsv(DEFAULT_GLOBAL_EXTENSIONS)).toBe("pdf");
	});

	it("matches file extensions case insensitively", () => {
		expect(matchesExtension("script.PDF", ["pdf"])).toBe(true);
		expect(matchesExtension("archive.tar.gz", ["gz"])).toBe(true);
		expect(matchesExtension("README", ["txt"])).toBe(false);
		expect(parseExtensionsInput(",, .pdf , ")).toEqual(["pdf"]);
	});

	it("creates a stable file key", () => {
		const first = createStableFileKey({
			courseId: 42,
			fileUrlOrPath: "/pluginfile.php/1/mod_resource/content/0/demo.pdf",
			filename: "demo.pdf",
			moduleId: 3,
			sectionId: "42:1",
		});
		const second = createStableFileKey({
			courseId: 42,
			fileUrlOrPath: "/pluginfile.php/1/mod_resource/content/0/demo.pdf",
			filename: "demo.pdf",
			moduleId: 3,
			sectionId: "42:1",
		});

		expect(first).toHaveLength(64);
		expect(second).toBe(first);
	});

	it("formats drive file names and resolves collisions", () => {
		const usedNames = new Set<string>();
		const first = formatDriveFileName({
			filename: "datenbanken.pdf",
			moduleName: "Einfuhrung",
			sectionName: "Skript",
			stableFileKey: "abcdef123456",
			usedNames,
		});
		const second = formatDriveFileName({
			filename: "datenbanken.pdf",
			moduleName: "Einfuhrung",
			sectionName: "Skript",
			stableFileKey: "123456abcdef",
			usedNames,
		});

		expect(first).toBe("Skript - Einfuhrung - datenbanken.pdf");
		expect(second).toBe("Skript - Einfuhrung - datenbanken-123456.pdf");
		usedNames.add("General - Notes - README");
		expect(
			formatDriveFileName({
				filename: "README",
				moduleName: "Notes",
				sectionName: "General",
				stableFileKey: "654321fedcba",
				usedNames,
			}),
		).toBe("General - Notes - README-654321");
	});

	it("computes the next schedule and due state", () => {
		const next = computeNextScheduledRun(
			"2026-06-14T00:30:00Z",
			"02:00",
			"Europe/Berlin",
		);

		expect(next.toISOString()).toBe("2026-06-15T00:00:00.000Z");
		expect(
			isScheduleDue({
				currentInstant: "2026-06-14T00:30:00Z",
				lastRunAt: null,
				time: "02:00",
				timezone: "Europe/Berlin",
			}),
		).toBe(true);
		expect(
			isScheduleDue({
				currentInstant: "2026-06-14T00:30:00Z",
				lastRunAt: "2026-06-14T00:10:00Z",
				time: "02:00",
				timezone: "Europe/Berlin",
			}),
		).toBe(false);
		expect(
			computeNextScheduledRun(
				"2026-06-13T21:30:00Z",
				"02:00",
				"Europe/Berlin",
			).toISOString(),
		).toBe("2026-06-14T00:00:00.000Z");
	});

	it("appends timestamped log lines", () => {
		const log = appendLogLine("", "Starting sync");
		expect(log).toContain("[INFO] Starting sync");
		expect(appendLogLine(log, "Done").split("\n")).toHaveLength(2);
	});
});
