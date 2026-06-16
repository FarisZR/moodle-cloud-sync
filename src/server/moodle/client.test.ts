import { describe, expect, it, vi } from "vitest";

import { createMoodleClient } from "~/server/moodle/client";

describe("moodle client", () => {
	it("logs in with a cookie-preserving session and parses launch tokens", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(null, {
					headers: {
						location:
							"https://moodle.example.test/simplesaml/module.php/multiauth/discovery?AuthState=state-1&source=Student",
						"set-cookie":
							"SimpleSAMLSessionID=ssp; Path=/; HttpOnly, MoodleSession=initial; Path=/; HttpOnly",
					},
					status: 303,
				}),
			)
			.mockResolvedValueOnce(
				new Response(null, {
					headers: {
						location:
							"https://moodle.example.test/simplesaml/module.php/core/loginuserpassorg?AuthState=state-1",
					},
					status: 303,
				}),
			)
			.mockResolvedValueOnce(
				new Response(
					'<form action="https://moodle.example.test/simplesaml/module.php/core/loginuserpassorg?AuthState=state-1"><input name="AuthState" value="state-1"></form>',
					{ status: 200 },
				),
			)
			.mockResolvedValueOnce(
				new Response(null, {
					headers: {
						location:
							"https://moodle.example.test/login/index.php?source=Student",
						"set-cookie": "SimpleSAMLAuthToken=saml-auth; Path=/; HttpOnly",
					},
					status: 303,
				}),
			)
			.mockResolvedValueOnce(
				new Response(null, {
					headers: {
						"set-cookie": "MoodleSession=abc123; Path=/; HttpOnly",
					},
					status: 303,
				}),
			)
			.mockImplementationOnce(
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					expect(init?.headers).toBeDefined();
					const headers = new Headers(init?.headers);
					expect(headers.get("cookie")).toContain("MoodleSession=abc123");
					const payload = Buffer.from(
						"site-id:::ws-token:::private-token",
						"utf8",
					).toString("base64");
					return new Response(null, {
						headers: { location: `moodlemobile://token=${payload}` },
						status: 302,
					});
				},
			);

		const client = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: fetchMock,
			passportFactory: () => "passport-123",
			verifySiteId: () => "site-id",
		});

		expect(
			await client.authenticateWithCredentials({
				organization: "example.org",
				password: "secret",
				username: "student@example.test",
			}),
		).toEqual({
			moodleSession: "abc123",
			passport: "passport-123",
			privateToken: "private-token",
			sessionStatus: 303,
			wstoken: "ws-token",
		});
	});

	it("throws when the launch page has no token location and wraps downloads", async () => {
		const authClient = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: vi
				.fn()
				.mockResolvedValueOnce(
					new Response(null, {
						headers: {
							location:
								"https://moodle.example.test/simplesaml/module.php/multiauth/discovery?AuthState=state-1&source=Student",
						},
						status: 303,
					}),
				)
				.mockResolvedValueOnce(
					new Response(null, {
						headers: {
							location:
								"https://moodle.example.test/simplesaml/module.php/core/loginuserpassorg?AuthState=state-1",
						},
						status: 303,
					}),
				)
				.mockResolvedValueOnce(
					new Response(
						'<form action="https://moodle.example.test/simplesaml/module.php/core/loginuserpassorg?AuthState=state-1"><input name="AuthState" value="state-1"></form>',
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(
					new Response(null, {
						headers: {
							location:
								"https://moodle.example.test/login/index.php?source=Student",
						},
						status: 303,
					}),
				)
				.mockResolvedValueOnce(new Response(null, { status: 303 }))
				.mockResolvedValueOnce(new Response("<html></html>", { status: 200 })),
			passportFactory: () => "passport-123",
		});

		await expect(
			authClient.authenticateWithCredentials({
				organization: "example.org",
				password: "secret",
				username: "student@example.test",
			}),
		).rejects.toThrow(
			"Moodle Student login did not return SimpleSAMLAuthToken",
		);

		const fileClient = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: vi
				.fn()
				.mockResolvedValueOnce(
					new Response(Buffer.from("hello", "utf8"), { status: 200 }),
				)
				.mockResolvedValueOnce(Response.json([]))
				.mockResolvedValueOnce(Response.json([])),
		});

		expect(
			await fileClient.downloadFile(
				"https://moodle.example.test/file.pdf",
				"token",
			),
		).toEqual(Buffer.from("hello", "utf8"));
		await fileClient.getCourseContents("token", 42);
		await fileClient.getCourses("token", 7);
	});

	it("sends moodle web service form requests", async () => {
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				const body = String(init?.body);
				expect(body).toContain("wstoken=ws-token");
				expect(body).toContain("wsfunction=core_webservice_get_site_info");
				return Response.json({ siteurl: "https://moodle.example.test" });
			},
		);

		const client = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: fetchMock,
		});

		expect(await client.getSiteInfo("ws-token")).toEqual({
			siteurl: "https://moodle.example.test",
		});
	});

	it("throws a typed error for api exceptions", async () => {
		const client = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: vi.fn(async () =>
				Response.json({
					errorcode: "invalidtoken",
					exception: "webservice_access_exception",
					message: "Invalid token",
				}),
			),
		});

		await expect(client.getSiteInfo("bad-token")).rejects.toEqual(
			expect.objectContaining({
				errorCode: "invalidtoken",
				message: "Invalid token",
			}),
		);
	});

	it("backs off and retries moodle rate limits", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json(
					{ errorcode: "ratelimited", message: "Too many requests" },
					{ status: 429 },
				),
			)
			.mockResolvedValueOnce(
				Response.json({ siteurl: "https://moodle.example.test" }),
			);
		const client = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: fetchMock,
			rateLimitBaseDelayMs: 0,
			rateLimitMaxRetries: 1,
		});

		await expect(client.getSiteInfo("ws-token")).resolves.toEqual({
			siteurl: "https://moodle.example.test",
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("throws a friendly error after rate limit retries are exhausted", async () => {
		const client = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: vi.fn(async () =>
				Response.json(
					{ errorcode: "ratelimited", message: "Too many requests" },
					{ headers: { "retry-after": "0" }, status: 429 },
				),
			),
			rateLimitBaseDelayMs: 0,
			rateLimitMaxRetries: 1,
		});

		await expect(client.getSiteInfo("ws-token")).rejects.toEqual(
			expect.objectContaining({
				errorCode: "ratelimited",
				message: "Moodle is rate limiting requests: Too many requests",
				name: "MoodleRateLimitError",
			}),
		);
	});
});
