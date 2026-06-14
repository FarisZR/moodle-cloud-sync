import { describe, expect, it, vi } from "vitest";

import { createMoodleClient } from "~/server/moodle/client";

describe("moodle client", () => {
	it("logs in with a cookie-preserving session and parses launch tokens", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				async (input: RequestInfo | URL, init?: RequestInit) => {
					expect(String(input)).toBe(
						"https://moodle.example.test/simplesaml/module.php/core/loginuserpassorg",
					);
					expect(init?.method).toBe("POST");
					expect(String(init?.body)).toContain(
						"username=student%40example.test",
					);
					const headers = new Headers();
					headers.append("set-cookie", "; Path=/");
					headers.append("set-cookie", "novalue; Path=/");
					headers.append(
						"set-cookie",
						"MoodleSession=abc123; Path=/; HttpOnly",
					);
					return new Response(null, { headers, status: 302 });
				},
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
			passport: "passport-123",
			privateToken: "private-token",
			wstoken: "ws-token",
		});
	});

	it("throws when the launch page has no token location and wraps downloads", async () => {
		const authClient = createMoodleClient({
			baseUrl: "https://moodle.example.test/",
			fetch: vi
				.fn()
				.mockResolvedValueOnce(new Response(null, { status: 302 }))
				.mockResolvedValueOnce(new Response("<html></html>", { status: 200 })),
			passportFactory: () => "passport-123",
		});

		await expect(
			authClient.authenticateWithCredentials({
				organization: "example.org",
				password: "secret",
				username: "student@example.test",
			}),
		).rejects.toThrow("Moodle mobile launch did not return a token location");

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
});
