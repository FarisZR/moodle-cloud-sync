import { describe, expect, it } from "vitest";

import {
	createPassport,
	extractLaunchLocation,
	parseLaunchToken,
} from "~/server/moodle/token";

describe("moodle launch token helpers", () => {
	it("parses a valid launch token with optional private token", () => {
		const passport = "passport-123";
		const siteId = "afca63f648a2f31eb2ae3db5f4f6f85c";
		const payload = Buffer.from(
			`${siteId}:::ws-token:::private-token`,
			"utf8",
		).toString("base64");

		expect(
			parseLaunchToken({
				baseUrl: "https://moodle.dhbw.de/",
				location: `moodlemobile://token=${payload}`,
				passport,
				verifySiteId: () => siteId,
			}),
		).toEqual({ privateToken: "private-token", wstoken: "ws-token" });
	});

	it("rejects mismatched site ids", () => {
		const payload = Buffer.from("wrong:::ws-token", "utf8").toString("base64");

		expect(() =>
			parseLaunchToken({
				baseUrl: "https://moodle.dhbw.de/",
				location: `moodlemobile://token=${payload}`,
				passport: "passport-123",
				verifySiteId: () => "expected",
			}),
		).toThrow("Moodle launch token site id mismatch");
	});

	it("extracts launch locations from headers or html", async () => {
		const headerResponse = new Response(null, {
			headers: { location: "moodlemobile://token=abc" },
			status: 302,
		});
		const htmlResponse = new Response(
			'<a id="launchapp" href="moodlemobile://token=def">Launch</a>',
			{ status: 200 },
		);

		expect(await extractLaunchLocation(headerResponse)).toBe(
			"moodlemobile://token=abc",
		);
		expect(await extractLaunchLocation(htmlResponse)).toBe(
			"moodlemobile://token=def",
		);
	});

	it("creates opaque passports", () => {
		const first = createPassport();
		const second = createPassport();

		expect(first).toMatch(/^[a-f0-9]{32}$/);
		expect(second).not.toBe(first);
	});

	it("parses launch tokens without a private token", () => {
		const payload = Buffer.from("site-id:::ws-token", "utf8").toString(
			"base64",
		);

		expect(
			parseLaunchToken({
				baseUrl: "https://moodle.dhbw.de/",
				location: `moodlemobile://token=${payload}`,
				passport: "passport-123",
				verifySiteId: () => "site-id",
			}),
		).toEqual({ privateToken: null, wstoken: "ws-token" });
	});
});
