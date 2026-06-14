import { GOOGLE_DRIVE_ROOT_FOLDER_NAME } from "~/server/core";
import type { AppEnv } from "~/server/env";
import { readEnv } from "~/server/env";
import { createGoogleDriveClient } from "~/server/google/client";
import type { SecretStore } from "~/server/secrets";
import { resolveGoogleClientCredentials } from "~/server/secrets";
import { SECRET_KEYS } from "~/server/store";
import type { PrismaClient } from "../../generated/prisma/client";
import { GoogleDeviceFlowStatus } from "../../generated/prisma/enums";

type Awaitable<T> = Promise<T> | T;

type GoogleRefreshClient = {
	refreshAccessToken(input: {
		clientId: string;
		clientSecret: string;
		refreshToken: string;
	}): Promise<{
		accessToken: string;
		expiresIn: number;
		tokenType: string;
	}>;
};

type GoogleFolderClient = GoogleRefreshClient & {
	ensureFolder(input: {
		accessToken: string;
		name: string;
		parentId?: string;
	}): Promise<{
		id: string;
		name: string;
		url: string;
	}>;
};

type GoogleDeviceCodeClient = {
	requestDeviceCode(input: { clientId: string; scope?: string }): Promise<{
		deviceCode: string;
		expiresIn: number;
		interval: number;
		userCode: string;
		verificationUrl: string;
	}>;
};

type GoogleDeviceFlowPollResult =
	| { status: "pending" }
	| { status: "slow_down" }
	| {
			accessToken: string;
			expiresIn: number;
			idToken: string | null;
			refreshToken: string;
			status: "approved";
			tokenType: string;
	  };

type GoogleDeviceFlowClient = {
	ensureFolder(input: {
		accessToken: string;
		name: string;
		parentId?: string;
	}): Promise<{
		id: string;
		name: string;
		url: string;
	}>;
	getDriveProfile(accessToken: string): Promise<{ email: string }>;
	pollDeviceCode(input: {
		clientId: string;
		clientSecret: string;
		deviceCode: string;
	}): Promise<GoogleDeviceFlowPollResult>;
};

export async function saveGoogleClientCredentials(
	prisma: PrismaClient,
	secretStore: SecretStore,
	input: { clientId: string; clientSecret: string },
) {
	await prisma.googleConnection.update({
		data: {
			clientId: input.clientId.trim(),
			clientSecretSaved: true,
			lastError: null,
		},
		where: { id: "google" },
	});

	await secretStore.set(SECRET_KEYS.googleClientSecret, input.clientSecret);
}

export async function startGoogleDeviceFlow(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
	createClient: () => GoogleDeviceCodeClient = () => createGoogleDriveClient(),
) {
	const credentials = await resolveGoogleClientCredentials(
		prisma,
		secretStore,
		env,
	);

	if (!(credentials.clientId && credentials.clientSecret)) {
		throw new Error("Google client credentials are not configured");
	}

	const deviceCode = await createClient().requestDeviceCode({
		clientId: credentials.clientId,
	});

	await prisma.googleDeviceFlow.upsert({
		create: {
			deviceCode: deviceCode.deviceCode,
			userCode: deviceCode.userCode,
			verificationUrl: deviceCode.verificationUrl,
			intervalSeconds: deviceCode.interval,
			expiresAt: new Date(Date.now() + deviceCode.expiresIn * 1000),
			status: GoogleDeviceFlowStatus.PENDING,
		},
		update: {
			deviceCode: deviceCode.deviceCode,
			userCode: deviceCode.userCode,
			verificationUrl: deviceCode.verificationUrl,
			intervalSeconds: deviceCode.interval,
			expiresAt: new Date(Date.now() + deviceCode.expiresIn * 1000),
			status: GoogleDeviceFlowStatus.PENDING,
			errorMessage: null,
		},
		where: { id: "google-device-flow" },
	});

	return deviceCode;
}

export async function withGoogleAccessToken<
	T,
	TClient extends GoogleRefreshClient,
>(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv,
	createClient: () => TClient,
	callback: (api: TClient, accessToken: string) => Awaitable<T>,
) {
	const credentials = await resolveGoogleClientCredentials(
		prisma,
		secretStore,
		env,
	);
	const refreshToken = await secretStore.get(SECRET_KEYS.googleRefreshToken);

	if (!(credentials.clientId && credentials.clientSecret && refreshToken)) {
		throw new Error("Google Drive is not connected");
	}

	const api = createClient();
	const token = await api.refreshAccessToken({
		clientId: credentials.clientId,
		clientSecret: credentials.clientSecret,
		refreshToken,
	});

	return await callback(api, token.accessToken);
}

export async function ensureDriveRootFolder<TClient extends GoogleFolderClient>(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv,
	createClient?: () => TClient,
) {
	const clientFactory =
		createClient ?? (() => createGoogleDriveClient() as unknown as TClient);
	const folder = await withGoogleAccessToken(
		prisma,
		secretStore,
		env,
		clientFactory,
		(api, accessToken) =>
			api.ensureFolder({ accessToken, name: GOOGLE_DRIVE_ROOT_FOLDER_NAME }),
	);

	await prisma.googleConnection.update({
		data: {
			driveRootFolderId: folder.id,
			driveRootFolderUrl: folder.url,
			lastError: null,
			lastSuccessAt: new Date(),
		},
		where: { id: "google" },
	});

	return folder;
}

export async function pollGoogleDeviceFlow<
	TClient extends GoogleDeviceFlowClient,
>(
	prisma: PrismaClient,
	secretStore: SecretStore,
	env: AppEnv = readEnv(),
	createClient?: () => TClient,
) {
	const clientFactory =
		createClient ?? (() => createGoogleDriveClient() as unknown as TClient);
	const flow = await prisma.googleDeviceFlow.findUniqueOrThrow({
		where: { id: "google-device-flow" },
	});

	if (flow.expiresAt <= new Date()) {
		await prisma.googleDeviceFlow.update({
			data: { status: GoogleDeviceFlowStatus.EXPIRED },
			where: { id: flow.id },
		});

		return { status: "expired" as const };
	}

	const credentials = await resolveGoogleClientCredentials(
		prisma,
		secretStore,
		env,
	);

	if (!(credentials.clientId && credentials.clientSecret)) {
		throw new Error("Google client credentials are not configured");
	}

	const api = clientFactory();
	const result = await api.pollDeviceCode({
		clientId: credentials.clientId,
		clientSecret: credentials.clientSecret,
		deviceCode: flow.deviceCode,
	});

	if (result.status !== "approved") {
		return result;
	}

	await secretStore.set(SECRET_KEYS.googleRefreshToken, result.refreshToken);
	const profile = await api.getDriveProfile(result.accessToken);
	const rootFolder = await api.ensureFolder({
		accessToken: result.accessToken,
		name: GOOGLE_DRIVE_ROOT_FOLDER_NAME,
	});

	await prisma.googleConnection.update({
		data: {
			connectedEmail: profile.email,
			driveRootFolderId: rootFolder.id,
			driveRootFolderUrl: rootFolder.url,
			hasRefreshToken: true,
			lastError: null,
			lastSuccessAt: new Date(),
		},
		where: { id: "google" },
	});
	await prisma.googleDeviceFlow.update({
		data: { status: GoogleDeviceFlowStatus.APPROVED },
		where: { id: flow.id },
	});

	return result;
}
