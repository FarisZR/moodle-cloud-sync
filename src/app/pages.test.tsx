import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const dashboardData = {
	app: {
		activeRunCourseName: null,
		activeRunProcessed: 0,
		activeRunStatus: "IDLE",
		globalExtensionsCsv: "pdf",
		lastError: null,
		scheduleEnabled: true,
		scheduleTime: "02:00",
		scheduleTimezone: "Europe/Berlin",
	},
	google: {
		connectedEmail: "student@example.test",
		driveRootFolderId: "root-folder-id",
		hasRefreshToken: true,
		lastError: null,
	},
	isSyncRunning: false,
	lastRun: {
		filesSkipped: 2,
		filesUpdated: 1,
		filesUploaded: 4,
		startedAt: new Date("2026-06-14T00:00:00.000Z"),
		status: "SUCCESS",
	},
	moodle: {
		baseUrl: "https://moodle.example.test/",
		credentialsSaved: true,
		lastError: null,
		tokenUpdatedAt: new Date("2026-06-13T23:00:00.000Z"),
		username: "student@example.test",
	},
	nextScheduledRun: new Date("2026-06-15T00:00:00.000Z"),
	recentRuns: [
		{
			filesSkipped: 2,
			filesUpdated: 1,
			filesUploaded: 4,
			id: "run-1",
			startedAt: new Date("2026-06-14T00:00:00.000Z"),
			status: "SUCCESS",
			trigger: "MANUAL",
		},
	],
};

const setupData = {
	app: {
		globalExtensionsCsv: "pdf,pptx",
		scheduleEnabled: true,
		scheduleTime: "03:00",
		scheduleTimezone: "Europe/Berlin",
	},
	google: {
		clientId: "ui-client-id",
		clientSecretSaved: true,
		connectedEmail: "student@example.test",
		hasRefreshToken: true,
	},
	googleDeviceFlow: {
		userCode: "ABCD-EFGH",
		verificationUrl: "https://www.google.com/device",
	},
	moodle: {
		baseUrl: "https://moodle.example.test/",
		credentialsSaved: true,
		organization: "example.org",
		tokenUpdatedAt: new Date("2026-06-13T23:00:00.000Z"),
		username: "student@example.test",
	},
};

const coursesData = {
	courses: [
		{
			course: {
				driveFolder: {
					folderUrl: "https://drive.google.com/drive/folders/course-folder-id",
				},
				fullName: "Databases",
				id: 42,
				sections: [
					{
						id: "42:1",
						name: "Week 1",
						sectionIndex: 1,
						syncConfig: { selected: true },
					},
				],
				shortName: "DB",
				syncConfig: {
					enabled: true,
					extensionsCsv: "pdf,zip",
					lastSyncStatus: "SUCCESS",
					useGlobalExtensions: false,
				},
			},
			matchingFilesCount: 7,
			selectedSectionsCount: 1,
		},
	],
	globalExtensions: ["pdf"],
};

const logsData = {
	app: {},
	runs: [
		{
			errorMessage: null,
			filesSkipped: 2,
			filesUpdated: 1,
			filesUploaded: 4,
			id: "run-1",
			logText: "Starting sync\nSync complete",
			startedAt: new Date("2026-06-14T00:00:00.000Z"),
			status: "SUCCESS",
			trigger: "MANUAL",
		},
	],
};

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/app-state", () => ({
	loadCoursesPageData: vi.fn(async () => coursesData),
	loadDashboardPageData: vi.fn(async () => dashboardData),
	loadLogsPageData: vi.fn(async () => logsData),
	loadSetupPageData: vi.fn(async () => setupData),
}));

describe("app pages", () => {
	it("renders the dashboard page", async () => {
		const { default: DashboardPage } = await import("~/app/dashboard/page");
		const html = renderToStaticMarkup(await DashboardPage());

		expect(html).toContain("Dashboard");
		expect(html).toContain("Run Sync Now");
		expect(html).toContain("Recent Activity");
	});

	it("renders the setup page", async () => {
		const { default: SetupPage } = await import("~/app/setup/page");
		const html = renderToStaticMarkup(await SetupPage());

		expect(html).toContain("Moodle Settings");
		expect(html).toContain("Google Drive Setup");
		expect(html).toContain("Test Connection");
		expect(html).toContain("********");
		expect(html).not.toContain("ABCD-EFGH");
	});

	it("renders setup action feedback", async () => {
		const { default: SetupPage } = await import("~/app/setup/page");
		const html = renderToStaticMarkup(
			await SetupPage({
				searchParams: Promise.resolve({
					googleTest: "success",
					googleVerify: "pending",
					moodleTest: "success",
				}),
			}),
		);

		expect(html).toContain("Moodle connection works");
		expect(html).toContain("Google client credentials work");
		expect(html).toContain("Google approval is still pending");
	});

	it("renders the courses page", async () => {
		const { default: CoursesPage } = await import("~/app/courses/page");
		const html = renderToStaticMarkup(await CoursesPage());

		expect(html).toContain("Databases");
		expect(html).toContain("Sync This Course");
		expect(html).toContain("Week 1");
	});

	it("renders the logs page", async () => {
		const { default: LogsPage } = await import("~/app/logs/page");
		const html = renderToStaticMarkup(await LogsPage());

		expect(html).toContain("Sync Runs");
		expect(html).toContain("Starting sync");
	});
});
