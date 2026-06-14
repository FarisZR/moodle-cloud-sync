import { createHash, randomBytes } from "node:crypto";

import { normalizeBaseUrl } from "~/server/core";

const MOODLE_SCHEME_PREFIX = "moodlemobile://token=";

export function createPassport() {
	return randomBytes(16).toString("hex");
}

export async function extractLaunchLocation(response: Response) {
	const headerLocation = response.headers.get("location");

	if (headerLocation) {
		return headerLocation;
	}

	const body = await response.text();
	const match = body.match(/href=["'](moodlemobile:\/\/token=[^"']+)/i);

	return match?.[1] ?? null;
}

export function parseLaunchToken(input: {
	baseUrl: string;
	location: string;
	passport: string;
	verifySiteId?: (value: string) => string;
}) {
	if (!input.location.startsWith(MOODLE_SCHEME_PREFIX)) {
		throw new Error("Moodle launch location is missing the mobile token");
	}

	const encoded = input.location.slice(MOODLE_SCHEME_PREFIX.length);
	const decoded = Buffer.from(decodeURIComponent(encoded), "base64").toString(
		"utf8",
	);
	const [siteId, wstoken, privateToken] = decoded.split(":::");
	const expectedSiteIds = input.verifySiteId
		? [input.verifySiteId(input.passport)]
		: [
				createHash("md5")
					.update(`${normalizeBaseUrl(input.baseUrl)}${input.passport}`)
					.digest("hex"),
				createHash("md5")
					.update(
						`${normalizeBaseUrl(input.baseUrl).replace(/\/$/, "")}${input.passport}`,
					)
					.digest("hex"),
			];

	if (!(siteId && wstoken)) {
		throw new Error("Moodle launch token payload is invalid");
	}

	if (!expectedSiteIds.includes(siteId)) {
		throw new Error("Moodle launch token site id mismatch");
	}

	return {
		privateToken: privateToken ?? null,
		wstoken,
	};
}
