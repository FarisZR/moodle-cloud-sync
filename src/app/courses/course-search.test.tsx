/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CourseSearchControls } from "~/app/courses/course-search";

function renderCourseSearch() {
	render(
		<div>
			<CourseSearchControls totalCourses={2} />
			<div data-course-search-empty hidden>
				No courses match your search.
			</div>
			<article data-course-search="DB Databases">Databases</article>
			<article data-course-search="MATH Calculus">Calculus</article>
		</div>,
	);
}

describe("CourseSearchControls", () => {
	afterEach(() => {
		cleanup();
	});

	it("filters rendered course cards as the search query changes", async () => {
		const user = userEvent.setup();
		renderCourseSearch();

		await user.type(screen.getByPlaceholderText("Search courses..."), "data");

		expect(screen.getByText("Databases").hidden).toBe(false);
		expect(screen.getByText("Calculus").hidden).toBe(true);
		expect(screen.getByText("1 of 2 courses shown")).toBeDefined();

		await user.clear(screen.getByPlaceholderText("Search courses..."));

		expect(screen.getByText("Databases").hidden).toBe(false);
		expect(screen.getByText("Calculus").hidden).toBe(false);
		expect(screen.getByText("2 courses discovered")).toBeDefined();
	});

	it("shows the empty state when no courses match", async () => {
		const user = userEvent.setup();
		renderCourseSearch();

		await user.type(
			screen.getByPlaceholderText("Search courses..."),
			"physics",
		);

		expect(screen.getByText("Databases").hidden).toBe(true);
		expect(screen.getByText("Calculus").hidden).toBe(true);
		expect(screen.getByText("No courses match your search.").hidden).toBe(
			false,
		);
	});
});
