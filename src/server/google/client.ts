import {
	GOOGLE_DRIVE_ROOT_FOLDER_NAME,
	GOOGLE_DRIVE_SCOPE,
} from "~/server/core";

type FetchLike = typeof fetch;

type GoogleDriveClientOptions = {
	fetch?: FetchLike;
};

type DriveFile = {
	id: string;
	name: string;
	webViewLink?: string;
};

export class GoogleDeviceAuthorizationError extends Error {
	constructor(
		readonly error: string,
		message: string,
	) {
		super(message);
		this.name = "GoogleDeviceAuthorizationError";
	}
}

export function createMultipartBody(input: {
	boundary: string;
	content: Buffer;
	metadata: Record<string, unknown>;
	mimeType: string;
}) {
	return Buffer.concat([
		Buffer.from(
			`--${input.boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(input.metadata)}\r\n--${input.boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
			"utf8",
		),
		input.content,
		Buffer.from(`\r\n--${input.boundary}--`, "utf8"),
	]);
}

function defaultFileUrl(id: string) {
	return `https://drive.google.com/file/d/${id}/view`;
}

function defaultFolderUrl(id: string) {
	return `https://drive.google.com/drive/folders/${id}`;
}

function toDriveFile(entry: DriveFile, folder = false) {
	return {
		id: entry.id,
		name: entry.name,
		url:
			entry.webViewLink ??
			(folder ? defaultFolderUrl(entry.id) : defaultFileUrl(entry.id)),
	};
}

function escapeQueryValue(value: string) {
	return value.replace(/'/g, "\\'");
}

export function createGoogleDriveClient(
	options: GoogleDriveClientOptions = {},
) {
	const fetchImpl = options.fetch ?? fetch;

	async function authorizedJson<T>(
		input: string | URL,
		accessToken: string,
		init: RequestInit = {},
	) {
		const headers = new Headers(init.headers);
		headers.set("authorization", `Bearer ${accessToken}`);

		const response = await fetchImpl(input, { ...init, headers });
		const payload = (await response.json()) as T & {
			error?: string;
			error_description?: string;
		};

		if (!response.ok) {
			throw new Error(
				payload.error_description ??
					payload.error ??
					`Google API request failed with status ${response.status}`,
			);
		}

		return payload;
	}

	return {
		ensureFolder: async (input: {
			accessToken: string;
			name: string;
			parentId?: string;
		}) => {
			const queryParts = [
				`name='${escapeQueryValue(input.name)}'`,
				"mimeType='application/vnd.google-apps.folder'",
				"trashed=false",
			];

			if (input.parentId) {
				queryParts.push(`'${input.parentId}' in parents`);
			}

			const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
			listUrl.searchParams.set("fields", "files(id,name,webViewLink)");
			listUrl.searchParams.set("pageSize", "1");
			listUrl.searchParams.set("q", queryParts.join(" and "));

			const listResponse = await authorizedJson<{ files: DriveFile[] }>(
				listUrl,
				input.accessToken,
			);

			const existing = listResponse.files[0];

			if (existing) {
				return toDriveFile(existing, true);
			}

			const created = await authorizedJson<DriveFile>(
				"https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
				input.accessToken,
				{
					body: JSON.stringify({
						mimeType: "application/vnd.google-apps.folder",
						name: input.name,
						...(input.parentId ? { parents: [input.parentId] } : {}),
					}),
					headers: { "content-type": "application/json" },
					method: "POST",
				},
			);

			return toDriveFile(created, true);
		},
		getDriveProfile: async (accessToken: string) => {
			const response = await authorizedJson<{ user: { emailAddress: string } }>(
				"https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
				accessToken,
			);

			return { email: response.user.emailAddress };
		},
		pollDeviceCode: async (input: {
			clientId: string;
			clientSecret: string;
			deviceCode: string;
		}) => {
			const response = await fetchImpl("https://oauth2.googleapis.com/token", {
				body: new URLSearchParams({
					client_id: input.clientId,
					client_secret: input.clientSecret,
					device_code: input.deviceCode,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
				method: "POST",
			});
			const payload = (await response.json()) as {
				access_token?: string;
				error?: string;
				error_description?: string;
				expires_in?: number;
				id_token?: string;
				refresh_token?: string;
				token_type?: string;
			};

			if (payload.error === "authorization_pending") {
				return { status: "pending" as const };
			}

			if (payload.error === "slow_down") {
				return { status: "slow_down" as const };
			}

			if (!response.ok || payload.error) {
				throw new GoogleDeviceAuthorizationError(
					payload.error ?? "device_authorization_failed",
					payload.error_description ??
						payload.error ??
						"Google device authorization failed",
				);
			}

			return {
				accessToken: payload.access_token ?? "",
				expiresIn: payload.expires_in ?? 0,
				idToken: payload.id_token ?? null,
				refreshToken: payload.refresh_token ?? "",
				status: "approved" as const,
				tokenType: payload.token_type ?? "Bearer",
			};
		},
		refreshAccessToken: async (input: {
			clientId: string;
			clientSecret: string;
			refreshToken: string;
		}) => {
			const response = await fetchImpl("https://oauth2.googleapis.com/token", {
				body: new URLSearchParams({
					client_id: input.clientId,
					client_secret: input.clientSecret,
					grant_type: "refresh_token",
					refresh_token: input.refreshToken,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
				method: "POST",
			});
			const payload = (await response.json()) as {
				access_token: string;
				expires_in: number;
				token_type: string;
			};

			if (!response.ok) {
				throw new Error("Google token refresh failed");
			}

			return {
				accessToken: payload.access_token,
				expiresIn: payload.expires_in,
				tokenType: payload.token_type,
			};
		},
		testClientCredentials: async (input: {
			clientId: string;
			clientSecret: string;
		}) => {
			const response = await fetchImpl("https://oauth2.googleapis.com/token", {
				body: new URLSearchParams({
					client_id: input.clientId,
					client_secret: input.clientSecret,
					grant_type: "refresh_token",
					refresh_token: "moodle-cloud-sync-credential-test",
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
				method: "POST",
			});
			const payload = (await response.json()) as {
				error?: string;
				error_description?: string;
			};

			if (payload.error === "invalid_grant") {
				return;
			}

			if (!response.ok || payload.error) {
				throw new Error(
					payload.error_description ??
						payload.error ??
						"Google client credential test failed",
				);
			}
		},
		requestDeviceCode: async (input: { clientId: string; scope?: string }) => {
			const response = await fetchImpl(
				"https://oauth2.googleapis.com/device/code",
				{
					body: new URLSearchParams({
						client_id: input.clientId,
						scope: input.scope ?? GOOGLE_DRIVE_SCOPE,
					}),
					headers: { "content-type": "application/x-www-form-urlencoded" },
					method: "POST",
				},
			);
			const payload = (await response.json()) as {
				device_code: string;
				expires_in: number;
				interval: number;
				user_code: string;
				verification_url: string;
			};

			if (!response.ok) {
				throw new Error("Google device authorization request failed");
			}

			return {
				deviceCode: payload.device_code,
				expiresIn: payload.expires_in,
				interval: payload.interval,
				userCode: payload.user_code,
				verificationUrl: payload.verification_url,
			};
		},
		uploadFile: async (input: {
			accessToken: string;
			content: Buffer;
			mimeType: string;
			name: string;
			parentId: string;
		}) => {
			const boundary = `moodle-study-sync-${Date.now()}`;
			const body = createMultipartBody({
				boundary,
				content: input.content,
				metadata: { name: input.name, parents: [input.parentId] },
				mimeType: input.mimeType,
			});

			const response = await authorizedJson<DriveFile>(
				"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
				input.accessToken,
				{
					body,
					headers: {
						"content-type": `multipart/related; boundary=${boundary}`,
					},
					method: "POST",
				},
			);

			return toDriveFile(response);
		},
		updateFile: async (input: {
			accessToken: string;
			content: Buffer;
			fileId: string;
			mimeType: string;
			name: string;
		}) => {
			const boundary = `moodle-study-sync-${Date.now()}`;
			const body = createMultipartBody({
				boundary,
				content: input.content,
				metadata: { name: input.name },
				mimeType: input.mimeType,
			});

			const response = await authorizedJson<DriveFile>(
				`https://www.googleapis.com/upload/drive/v3/files/${input.fileId}?uploadType=multipart&fields=id,name,webViewLink`,
				input.accessToken,
				{
					body,
					headers: {
						"content-type": `multipart/related; boundary=${boundary}`,
					},
					method: "PATCH",
				},
			);

			return toDriveFile(response);
		},
	};
}

export { GOOGLE_DRIVE_ROOT_FOLDER_NAME };
