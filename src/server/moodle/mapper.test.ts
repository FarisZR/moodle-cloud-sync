import { describe, expect, it } from "vitest";

import { mapCourseContents } from "~/server/moodle/mapper";

describe("moodle metadata mapping", () => {
	it("flattens course sections, modules, and files", () => {
		const result = mapCourseContents(42, [
			{
				id: 100,
				modules: [
					{
						contents: [
							{
								fileurl:
									"https://moodle.example.test/pluginfile.php/1/mod_resource/content/0/intro.pdf",
								filename: "intro.pdf",
								filepath: "/",
								filesize: 120,
								mimetype: "application/pdf",
								timemodified: 1700000000,
							},
						],
						id: 200,
						modname: "resource",
						name: "Einfuhrung",
						uservisible: true,
						visible: 1,
					},
				],
				name: "Skript",
				section: 1,
				uservisible: true,
				visible: 1,
			},
		]);

		expect(result.sections).toEqual([
			expect.objectContaining({
				courseId: 42,
				id: "42:1",
				moodleSectionId: 100,
				name: "Skript",
				sectionIndex: 1,
			}),
		]);
		expect(result.modules).toEqual([
			expect.objectContaining({
				courseId: 42,
				id: 200,
				moduleType: "resource",
				sectionId: "42:1",
			}),
		]);
		expect(result.files).toEqual([
			expect.objectContaining({
				courseId: 42,
				filename: "intro.pdf",
				moduleId: 200,
				moduleName: "Einfuhrung",
				sectionId: "42:1",
				sectionName: "Skript",
			}),
		]);
	});

	it("uses fallback names and ignores incomplete content entries", () => {
		const result = mapCourseContents(42, [
			{
				modules: [
					{
						contents: [{ filename: "ignored.pdf" }],
						id: 200,
					},
				],
			},
		]);

		expect(result.sections[0]).toMatchObject({ name: "Section 0" });
		expect(result.modules[0]).toMatchObject({
			moduleType: "unknown",
			name: "Module 200",
		});
		expect(result.files).toEqual([]);
	});
});
