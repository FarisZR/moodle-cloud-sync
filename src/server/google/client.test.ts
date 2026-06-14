import { describe, expect, it, vi } from "vitest";

import {
	createGoogleDriveClient,
	createMultipartBody,
} from "~/server/google/client";

describe("google drive client", () => {
	it("requests a device code", async () => {
		const client = createGoogleDriveClient({
			fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(init?.body)).toContain("client_id=client-id");
				expect(String(init?.body)).toContain(
					"scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file",
				);
				return Response.json({
					device_code: "device-code",
					expires_in: 1800,
					interval: 5,
					user_code: "ABCD-EFGH",
					verification_url: "https://www.google.com/device",
				});
			}),
		});

		expect(await client.requestDeviceCode({ clientId: "client-id" })).toEqual({
			deviceCode: "device-code",
			expiresIn: 1800,
			interval: 5,
			userCode: "ABCD-EFGH",
			verificationUrl: "https://www.google.com/device",
		});
	});

	it("returns pending status while authorization is incomplete", async () => {
		const client = createGoogleDriveClient({
			fetch: vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: "authorization_pending",
							error_description: "Pending",
						}),
						{ status: 428 },
					),
			),
		});

		expect(
			await client.pollDeviceCode({
				clientId: "client-id",
				clientSecret: "client-secret",
				deviceCode: "device-code",
			}),
		).toEqual({ status: "pending" });
	});

	it("returns slow_down when polling too quickly", async () => {
		const client = createGoogleDriveClient({
			fetch: vi.fn(
				async () =>
					new Response(JSON.stringify({ error: "slow_down" }), { status: 403 }),
			),
		});

		expect(
			await client.pollDeviceCode({
				clientId: "client-id",
				clientSecret: "client-secret",
				deviceCode: "device-code",
			}),
		).toEqual({ status: "slow_down" });
	});

	it("returns approved tokens once the user authorizes", async () => {
		const client = createGoogleDriveClient({
			fetch: vi.fn(async () =>
				Response.json({
					access_token: "access-token",
					expires_in: 3600,
					id_token: "id-token",
					refresh_token: "refresh-token",
					token_type: "Bearer",
				}),
			),
		});

		expect(
			await client.pollDeviceCode({
				clientId: "client-id",
				clientSecret: "client-secret",
				deviceCode: "device-code",
			}),
		).toEqual({
			accessToken: "access-token",
			expiresIn: 3600,
			idToken: "id-token",
			refreshToken: "refresh-token",
			status: "approved",
			tokenType: "Bearer",
		});
	});

	it("falls back to empty approved token values when omitted", async () => {
		const client = createGoogleDriveClient({
			fetch: vi.fn(async () => Response.json({})),
		});

		expect(
			await client.pollDeviceCode({
				clientId: "client-id",
				clientSecret: "client-secret",
				deviceCode: "device-code",
			}),
		).toEqual({
			accessToken: "",
			expiresIn: 0,
			idToken: null,
			refreshToken: "",
			status: "approved",
			tokenType: "Bearer",
		});
	});

	it("creates folders and uploads files", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(async (input: RequestInfo | URL) => {
				const url = new URL(String(input));
				expect(url.pathname).toBe("/drive/v3/files");
				expect(url.searchParams.get("q")).toContain("Moodle Study Sync");
				return Response.json({ files: [] });
			})
			.mockImplementationOnce(
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					expect(init?.method).toBe("POST");
					return Response.json({ id: "folder-1", name: "Moodle Study Sync" });
				},
			)
			.mockImplementationOnce(
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					expect(init?.method).toBe("POST");
					const body = init?.body as Buffer;
					expect(body.toString("utf8")).toContain("lecture.pdf");
					expect(body.toString("utf8")).toContain("hello world");
					return Response.json({ id: "file-1", name: "lecture.pdf" });
				},
			);

		const client = createGoogleDriveClient({ fetch: fetchMock });
		const folder = await client.ensureFolder({
			accessToken: "access-token",
			name: "Moodle Study Sync",
		});
		const uploaded = await client.uploadFile({
			accessToken: "access-token",
			content: Buffer.from("hello world", "utf8"),
			mimeType: "application/pdf",
			name: "lecture.pdf",
			parentId: folder.id,
		});

		expect(folder).toEqual({
			id: "folder-1",
			name: "Moodle Study Sync",
			url: "https://drive.google.com/drive/folders/folder-1",
		});
		expect(uploaded).toEqual({
			id: "file-1",
			name: "lecture.pdf",
			url: "https://drive.google.com/file/d/file-1/view",
		});
	});

	it("builds multipart bodies for upload requests", () => {
		const body = createMultipartBody({
			boundary: "boundary-123",
			content: Buffer.from("hello", "utf8"),
			metadata: { name: "hello.txt", parents: ["folder-1"] },
			mimeType: "text/plain",
		});

		expect(body.toString("utf8")).toContain('"name":"hello.txt"');
		expect(body.toString("utf8")).toContain("hello");
	});

	it("throws a typed device authorization error for access denial", async () => {
		const client = createGoogleDriveClient({
			fetch: vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: "access_denied",
							error_description: "Forbidden",
						}),
						{ status: 403 },
					),
			),
		});

		await expect(
			client.pollDeviceCode({
				clientId: "client-id",
				clientSecret: "client-secret",
				deviceCode: "device-code",
			}),
		).rejects.toMatchObject({
			error: "access_denied",
			message: "Forbidden",
		});
	});

	it("uses an existing folder and supports default fetch", async () => {
		const folderClient = createGoogleDriveClient({
			fetch: vi.fn(async () =>
				Response.json({
					files: [
						{ id: "folder-1", name: "Folder", webViewLink: "https://folder" },
					],
				}),
			),
		});
		await expect(
			folderClient.ensureFolder({
				accessToken: "token",
				name: "Folder",
				parentId: "parent-1",
			}),
		).resolves.toEqual({
			id: "folder-1",
			name: "Folder",
			url: "https://folder",
		});

		const fetchMock = vi.fn(async () =>
			Response.json({ user: { emailAddress: "student@example.test" } }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const defaultClient = createGoogleDriveClient();
		expect(await defaultClient.getDriveProfile("token")).toEqual({
			email: "student@example.test",
		});
	});

	it("refreshes tokens, updates files, and handles request failures", async () => {
		const successClient = createGoogleDriveClient({
			fetch: vi.fn(async () =>
				Response.json({
					access_token: "token",
					expires_in: 3600,
					token_type: "Bearer",
				}),
			),
		});
		await expect(
			successClient.refreshAccessToken({
				clientId: "a",
				clientSecret: "b",
				refreshToken: "c",
			}),
		).resolves.toEqual({
			accessToken: "token",
			expiresIn: 3600,
			tokenType: "Bearer",
		});

		const updateClient = createGoogleDriveClient({
			fetch: vi.fn(async () =>
				Response.json({
					id: "file-1",
					name: "updated.pdf",
					webViewLink: "https://file",
				}),
			),
		});
		await expect(
			updateClient.updateFile({
				accessToken: "token",
				content: Buffer.from("x"),
				fileId: "file-1",
				mimeType: "application/pdf",
				name: "updated.pdf",
			}),
		).resolves.toEqual({
			id: "file-1",
			name: "updated.pdf",
			url: "https://file",
		});

		const errorClient = createGoogleDriveClient({
			fetch: vi.fn(
				async () =>
					new Response(JSON.stringify({ error: "bad" }), { status: 500 }),
			),
		});
		await expect(errorClient.getDriveProfile("token")).rejects.toThrow("bad");
		await expect(
			errorClient.requestDeviceCode({ clientId: "a" }),
		).rejects.toThrow("Google device authorization request failed");
		await expect(
			errorClient.refreshAccessToken({
				clientId: "a",
				clientSecret: "b",
				refreshToken: "c",
			}),
		).rejects.toThrow("Google token refresh failed");
	});

	it("tests client credentials without starting device flow", async () => {
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(init?.body)).toContain("client_id=client-id");
				expect(String(init?.body)).toContain("client_secret=client-secret");
				return new Response(JSON.stringify({ error: "invalid_grant" }), {
					status: 400,
				});
			},
		);
		const client = createGoogleDriveClient({ fetch: fetchMock });

		await expect(
			client.testClientCredentials({
				clientId: "client-id",
				clientSecret: "client-secret",
			}),
		).resolves.toBeUndefined();
	});

	it("rejects invalid google client credentials", async () => {
		const client = createGoogleDriveClient({
			fetch: vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: "invalid_client",
							error_description: "Unauthorized client",
						}),
						{ status: 401 },
					),
			),
		});

		await expect(
			client.testClientCredentials({
				clientId: "client-id",
				clientSecret: "wrong-secret",
			}),
		).rejects.toThrow("Unauthorized client");
	});
});
