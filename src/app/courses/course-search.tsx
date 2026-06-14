"use client";

import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "~/components/ui/input";

function normalizeSearch(value: string) {
	return value.trim().toLowerCase();
}

export function CourseSearchControls({
	totalCourses,
}: {
	totalCourses: number;
}) {
	const [query, setQuery] = useState("");
	const [visibleCourses, setVisibleCourses] = useState(totalCourses);
	const normalizedQuery = useMemo(() => normalizeSearch(query), [query]);

	useEffect(() => {
		const courseCards = Array.from(
			document.querySelectorAll<HTMLElement>("[data-course-search]"),
		);
		let visibleCount = 0;

		for (const card of courseCards) {
			const searchText = card.dataset.courseSearch?.toLowerCase() ?? "";
			const isVisible =
				normalizedQuery.length === 0 || searchText.includes(normalizedQuery);

			card.hidden = !isVisible;
			if (isVisible) {
				visibleCount += 1;
			}
		}

		const emptyResult = document.querySelector<HTMLElement>(
			"[data-course-search-empty]",
		);
		if (emptyResult) {
			emptyResult.hidden = totalCourses === 0 || visibleCount > 0;
		}

		setVisibleCourses(visibleCount);
	}, [normalizedQuery, totalCourses]);

	return (
		<>
			<label className="relative">
				<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="h-10 bg-white pl-9"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search courses..."
					type="search"
					value={query}
				/>
			</label>
			<button
				className="inline-flex h-10 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 font-medium text-primary text-sm shadow-sm"
				type="button"
			>
				<span className="inline-flex items-center gap-2">
					<SlidersHorizontal className="size-4" />
					All courses
				</span>
				<ChevronDown className="size-4" />
			</button>
			<p className="text-center font-medium text-muted-foreground text-sm md:text-left">
				{normalizedQuery.length > 0
					? `${visibleCourses} of ${totalCourses} courses shown`
					: `${totalCourses} courses discovered`}
			</p>
		</>
	);
}
