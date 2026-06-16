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
	rateLimitBaseDelayMs?: number;
	rateLimitMaxRetries?: number;
	studentSource?: string;
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

export class MoodleRateLimitError extends MoodleApiError {
	constructor(
		message?: string,
		readonly retryAfterSeconds: number | null = null,
		status = 429,
	) {
		super(
			message
				? `Moodle is rate limiting requests: ${message}`
				: "Moodle is rate limiting requests. Wait a few minutes before trying again.",
			"ratelimited",
			status,
		);
		this.name = "MoodleRateLimitError";
	}
}

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(value: string | null) {
	if (!value) {
		return null;
	}

	const seconds = Number(value);

	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds;
	}

	const retryDate = new Date(value);

	if (Number.isNaN(retryDate.getTime())) {
		return null;
	}

	return Math.max(0, Math.ceil((retryDate.getTime() - Date.now()) / 1000));
}

function getRateLimitDelayMs(input: {
	attempt: number;
	baseDelayMs: number;
	error: MoodleRateLimitError;
}) {
	if (input.error.retryAfterSeconds !== null) {
		return input.error.retryAfterSeconds * 1000;
	}

	return input.baseDelayMs * 2 ** input.attempt;
}

function isRateLimitPayload(payload: {
	errorcode?: string;
	exception?: string;
	message?: string;
}) {
	const combined = [payload.errorcode, payload.exception, payload.message]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	return (
		combined.includes("ratelimit") ||
		combined.includes("rate limit") ||
		combined.includes("too many requests") ||
		combined.includes("throttle")
	);
}

async function withRateLimitBackoff<T>(
	operation: () => Promise<T>,
	options: {
		baseDelayMs: number;
		maxRetries: number;
	},
) {
	for (let attempt = 0; ; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			if (
				!(error instanceof MoodleRateLimitError) ||
				attempt >= options.maxRetries
			) {
				throw error;
			}

			await delay(
				getRateLimitDelayMs({
					attempt,
					baseDelayMs: options.baseDelayMs,
					error,
				}),
			);
		}
	}
}

class CookieSession {
	private readonly cookies = new Map<string, string>();

	constructor(
		private readonly fetchImpl: FetchLike,
		private readonly userAgent: string,
		private readonly retryOptions: {
			baseDelayMs: number;
			maxRetries: number;
		},
	) {}

	async fetch(input: string | URL, init: RequestInit = {}) {
		return withRateLimitBackoff(async () => {
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

			if (response.status === 429) {
				throw new MoodleRateLimitError(
					undefined,
					parseRetryAfterSeconds(response.headers.get("retry-after")),
					response.status,
				);
			}

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
		}, this.retryOptions);
	}

	getCookie(name: string) {
		return this.cookies.get(name) ?? null;
	}
}

export function createMoodleClient(options: MoodleClientOptions) {
	const baseUrl = normalizeBaseUrl(options.baseUrl);
	const fetchImpl = options.fetch ?? fetch;
	const passportFactory = options.passportFactory ?? createPassport;
	const retryOptions = {
		baseDelayMs: options.rateLimitBaseDelayMs ?? 1000,
		maxRetries: options.rateLimitMaxRetries ?? 3,
	};
	const studentSource = options.studentSource ?? "Student";
	const userAgent = options.userAgent ?? MOODLE_MOBILE_USER_AGENT;

	async function authenticateWithCredentials(input: {
		organization: string;
		password: string;
		username: string;
	}) {
		const session = new CookieSession(fetchImpl, userAgent, retryOptions);
		const loginUrl = new URL("login/index.php", baseUrl);
		loginUrl.searchParams.set("source", studentSource);
		const launchPassport = passportFactory();

		const initialLogin = await session.fetch(loginUrl, { redirect: "manual" });
		const discoveryLocation = initialLogin.headers.get("location");

		if (!discoveryLocation) {
			throw new Error("Moodle login did not redirect to SimpleSAML discovery");
		}

		const discoveryUrl = new URL(discoveryLocation, baseUrl);
		const selectedSourceResponse = await session.fetch(discoveryUrl, {
			redirect: "manual",
		});
		const selectedSourceLocation =
			selectedSourceResponse.headers.get("location");

		if (!selectedSourceLocation) {
			throw new Error(
				"Moodle discovery did not redirect to the Student login form",
			);
		}

		const loginUserPassUrl = new URL(selectedSourceLocation, baseUrl);
		const authState = loginUserPassUrl.searchParams.get("AuthState");

		if (!authState) {
			throw new Error("Moodle Student login form did not include AuthState");
		}

		const loginUserPassPage = await session.fetch(loginUserPassUrl, {
			redirect: "manual",
		});
		const loginPageHtml = await loginUserPassPage.text();
		const formAction =
			loginPageHtml.match(/<form[^>]*action=["']([^"']+)["']/i)?.[1] ??
			loginUserPassUrl.toString();
		const formAuthState =
			loginPageHtml.match(/name="AuthState" value="([^"]+)"/i)?.[1] ??
			authState;
		const submitUrl = new URL(formAction, baseUrl);

		const submitResponse = await session.fetch(submitUrl, {
			body: new URLSearchParams({
				AuthState: formAuthState,
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

		if (!submitResponse.headers.get("location")) {
			throw new Error(
				"Moodle credentials were not accepted by the Student login form",
			);
		}

		if (!session.getCookie("SimpleSAMLAuthToken")) {
			throw new Error(
				"Moodle Student login did not return SimpleSAMLAuthToken",
			);
		}

		const moodleSessionResponse = await session.fetch(
			new URL(
				submitResponse.headers.get("location") ?? "login/index.php",
				baseUrl,
			),
			{
				redirect: "manual",
			},
		);

		const moodleSession = session.getCookie("MoodleSession");

		if (!moodleSession) {
			throw new Error("Moodle login did not yield a MoodleSession cookie");
		}

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
			moodleSession,
			passport: launchPassport,
			privateToken,
			sessionStatus: moodleSessionResponse.status,
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

		return withRateLimitBackoff(async () => {
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
			const payload = (await response.json().catch(() => ({}))) as {
				errorcode?: string;
				exception?: string;
				message?: string;
			};

			if (response.status === 429 || isRateLimitPayload(payload)) {
				throw new MoodleRateLimitError(
					payload.message,
					parseRetryAfterSeconds(response.headers.get("retry-after")),
					response.status,
				);
			}

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
		}, retryOptions);
	}

	return {
		authenticateWithCredentials,
		callWebService,
		downloadFile: async (fileUrl: string, wstoken: string) => {
			const url = new URL(fileUrl);
			url.searchParams.set("token", wstoken);

			const response = await withRateLimitBackoff(async () => {
				const response = await fetchImpl(url, {
					headers: { "user-agent": userAgent },
				});

				if (response.status === 429) {
					throw new MoodleRateLimitError(
						undefined,
						parseRetryAfterSeconds(response.headers.get("retry-after")),
						response.status,
					);
				}

				return response;
			}, retryOptions);

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
