import { MOODLE_MOBILE_USER_AGENT, normalizeBaseUrl } from "~/server/core";
import {
	createPassport,
	extractLaunchLocation,
	parseLaunchToken,
} from "~/server/moodle/token";

type FetchLike = typeof fetch;

type MoodleClientOptions = {
	baseUrl: string;
	fetch?: FetchLike;
	passportFactory?: () => string;
	userAgent?: string;
	verifySiteId?: (passport: string) => string;
};

export class MoodleApiError extends Error {
	constructor(
		message: string,
		readonly errorCode: string | null = null,
		readonly status: number | null = null,
	) {
		super(message);
		this.name = "MoodleApiError";
	}
}

class CookieSession {
	private readonly cookies = new Map<string, string>();

	constructor(
		private readonly fetchImpl: FetchLike,
		private readonly userAgent: string,
	) {}

	async fetch(input: string | URL, init: RequestInit = {}) {
		const headers = new Headers(init.headers);
		headers.set("user-agent", this.userAgent);

		if (this.cookies.size > 0) {
			headers.set(
				"cookie",
				[...this.cookies.entries()]
					.map(([name, value]) => `${name}=${value}`)
					.join("; "),
			);
		}

		const response = await this.fetchImpl(input, { ...init, headers });

		for (const cookie of response.headers.getSetCookie()) {
			const [pair] = cookie.split(";", 1);

			if (!pair) {
				continue;
			}

			const separatorIndex = pair.indexOf("=");

			if (separatorIndex === -1) {
				continue;
			}

			this.cookies.set(
				pair.slice(0, separatorIndex),
				pair.slice(separatorIndex + 1),
			);
		}

		return response;
	}
}

export function createMoodleClient(options: MoodleClientOptions) {
	const baseUrl = normalizeBaseUrl(options.baseUrl);
	const fetchImpl = options.fetch ?? fetch;
	const passportFactory = options.passportFactory ?? createPassport;
	const userAgent = options.userAgent ?? MOODLE_MOBILE_USER_AGENT;

	async function authenticateWithCredentials(input: {
		organization: string;
		password: string;
		username: string;
	}) {
		const session = new CookieSession(fetchImpl, userAgent);
		const loginUrl = new URL(
			"simplesaml/module.php/core/loginuserpassorg",
			baseUrl,
		);
		const launchPassport = passportFactory();

		await session.fetch(loginUrl, {
			body: new URLSearchParams({
				organization: input.organization,
				password: input.password,
				username: input.username,
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
			method: "POST",
			redirect: "manual",
		});

		const launchUrl = new URL("admin/tool/mobile/launch.php", baseUrl);
		launchUrl.searchParams.set("passport", launchPassport);
		launchUrl.searchParams.set("service", "moodle_mobile_app");
		launchUrl.searchParams.set("urlscheme", "moodlemobile");

		const launchResponse = await session.fetch(launchUrl, {
			redirect: "manual",
		});
		const location = await extractLaunchLocation(launchResponse);

		if (!location) {
			throw new Error("Moodle mobile launch did not return a token location");
		}

		const { privateToken, wstoken } = parseLaunchToken({
			baseUrl,
			location,
			passport: launchPassport,
			verifySiteId: options.verifySiteId,
		});

		return {
			passport: launchPassport,
			privateToken,
			wstoken,
		};
	}

	async function callWebService<T>(
		wstoken: string,
		wsfunction: string,
		params: Record<string, string | number> = {},
	) {
		const body = new URLSearchParams({
			moodlewsrestformat: "json",
			wsfunction,
			wstoken,
		});

		for (const [key, value] of Object.entries(params)) {
			body.set(key, String(value));
		}

		const response = await fetchImpl(
			new URL("webservice/rest/server.php", baseUrl),
			{
				body,
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"user-agent": userAgent,
				},
				method: "POST",
			},
		);
		const payload = (await response.json()) as {
			errorcode?: string;
			exception?: string;
			message?: string;
		};

		if (!response.ok) {
			throw new MoodleApiError(
				payload.message ??
					`Moodle API request failed with status ${response.status}`,
				payload.errorcode ?? null,
				response.status,
			);
		}

		if (payload.exception || payload.errorcode) {
			throw new MoodleApiError(
				payload.message ?? "Moodle API request failed",
				payload.errorcode ?? null,
				response.status,
			);
		}

		return payload as T;
	}

	return {
		authenticateWithCredentials,
		callWebService,
		downloadFile: async (fileUrl: string, wstoken: string) => {
			const url = new URL(fileUrl);
			url.searchParams.set("token", wstoken);

			const response = await fetchImpl(url, {
				headers: { "user-agent": userAgent },
			});

			if (!response.ok) {
				throw new MoodleApiError(
					`Moodle file download failed with status ${response.status}`,
					null,
					response.status,
				);
			}

			return Buffer.from(await response.arrayBuffer());
		},
		getCourseContents: (wstoken: string, courseId: number) =>
			callWebService(wstoken, "core_course_get_contents", {
				courseid: courseId,
			}),
		getCourses: (wstoken: string, userId: number) =>
			callWebService(wstoken, "core_enrol_get_users_courses", {
				userid: userId,
			}),
		getSiteInfo: (wstoken: string) =>
			callWebService(wstoken, "core_webservice_get_site_info"),
	};
}
