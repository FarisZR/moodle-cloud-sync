import {
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	FileText,
	Folder,
	Info,
	Layers3,
	RefreshCcw,
	X,
} from "lucide-react";

import {
	startCourseSyncAction,
	startSyncAction,
	updateCourseConfigAction,
	updateSectionSelectionAction,
} from "~/app/actions";
import { CourseSearchControls } from "~/app/courses/course-search";
import { CopyButton, ExtensionEditor } from "~/app/extension-controls";
import { AutoSubmitCheckbox, PendingButton } from "~/app/form-feedback";
import { PageHeader } from "~/app/page-header";
import { Card, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { loadCoursesPageData } from "~/server/app-state";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

function splitExtensions(value: string) {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function formatExtensions(extensions: string[]) {
	return extensions.length > 0 ? extensions.join(", ") : "No file types";
}

function matchesExtension(filename: string, extensions: string[]) {
	const extension = filename.split(".").pop()?.toLowerCase();
	return extension ? extensions.includes(extension) : false;
}

function countSectionFiles(
	files: Array<{ filename: string; sectionId: string | null }>,
	sectionId: string,
	extensions: string[],
) {
	return files.filter(
		(file) =>
			file.sectionId === sectionId &&
			matchesExtension(file.filename, extensions),
	).length;
}

function CourseBadge({
	tone,
	children,
}: {
	tone: "enabled" | "disabled" | "review";
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-6 items-center rounded-md px-2 font-semibold text-xs",
				tone === "enabled" && "bg-emerald-50 text-emerald-700",
				tone === "disabled" && "bg-slate-100 text-slate-600",
				tone === "review" && "bg-amber-50 text-amber-700",
			)}
		>
			{children}
		</span>
	);
}

function MetaItem({
	icon: Icon,
	children,
	tone = "neutral",
}: {
	icon: React.ComponentType<{ className?: string }>;
	children: React.ReactNode;
	tone?: "neutral" | "success" | "muted";
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 whitespace-nowrap text-xs",
				tone === "neutral" && "text-slate-600",
				tone === "success" && "text-emerald-700",
				tone === "muted" && "text-muted-foreground",
			)}
		>
			<Icon className="size-3.5" />
			{children}
		</span>
	);
}

export default async function CoursesPage() {
	const data = await loadCoursesPageData(db);
	const courses = [...data.courses].sort((a, b) => {
		const aEnabled = a.course.syncConfig?.enabled ?? false;
		const bEnabled = b.course.syncConfig?.enabled ?? false;

		if (aEnabled !== bEnabled) {
			return aEnabled ? -1 : 1;
		}

		return a.course.fullName.localeCompare(b.course.fullName);
	});
	const expandedCourseId =
		courses.find(({ course }) => course.syncConfig?.enabled)?.course.id ??
		courses[0]?.course.id;

	return (
		<div className="space-y-5">
			<PageHeader
				description="Choose which courses and sections sync to Google Drive."
				title="Courses"
			/>

			<div className="grid gap-5 xl:grid-cols-[1fr_300px]">
				<div className="min-w-0 space-y-4">
					<div className="grid gap-3 md:grid-cols-[280px_160px_1fr_auto] md:items-center">
						<CourseSearchControls totalCourses={courses.length} />
						<form action={startSyncAction}>
							<PendingButton className="h-10 px-5" pendingLabel="Starting...">
								<RefreshCcw className="size-4" />
								Sync all enabled
							</PendingButton>
						</form>
					</div>

					<div className="space-y-2">
						<Card
							className="rounded-lg border-slate-200 bg-white shadow-sm"
							data-course-search-empty
							hidden
						>
							<CardContent className="py-10 text-center text-muted-foreground">
								No courses match your search.
							</CardContent>
						</Card>
						{courses.length === 0 ? (
							<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
								<CardContent className="py-10 text-center text-muted-foreground">
									No Moodle courses discovered yet. Run metadata refresh from
									the dashboard after connecting Moodle.
								</CardContent>
							</Card>
						) : (
							courses.map(
								({ course, matchingFilesCount, selectedSectionsCount }) => {
									const isEnabled = course.syncConfig?.enabled ?? false;
									const isExpanded =
										isEnabled && course.id === expandedCourseId;
									const activeExtensions =
										(course.syncConfig?.useGlobalExtensions ?? true)
											? data.globalExtensions
											: splitExtensions(course.syncConfig?.extensionsCsv ?? "");
									const extensionLabel = formatExtensions(activeExtensions);
									const courseFiles = course.files ?? [];
									const statusTone = !isEnabled
										? "disabled"
										: matchingFilesCount === 0
											? "review"
											: "enabled";

									return (
										<article
											className={cn(
												"overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
												isExpanded &&
													"shadow-[0_12px_32px_rgba(15,23,42,0.08)]",
											)}
											data-course-search={`${course.shortName} ${course.fullName}`}
											key={course.id}
										>
											<div className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
												<div className="flex min-w-0 items-start gap-4">
													<form
														action={updateCourseConfigAction}
														className="pt-0.5"
													>
														<input
															name="courseId"
															type="hidden"
															value={course.id}
														/>
														<input
															name="extensions"
															type="hidden"
															value={course.syncConfig?.extensionsCsv ?? ""}
														/>
														{(course.syncConfig?.useGlobalExtensions ??
														true) ? (
															<input
																name="useGlobalExtensions"
																type="hidden"
																value="on"
															/>
														) : null}
														<AutoSubmitCheckbox
															aria-label={`Enable ${course.shortName}`}
															defaultChecked={isEnabled}
															mode="switch"
															name="enabled"
														/>
													</form>
													<div className="min-w-0 space-y-2">
														<h2
															className={cn(
																"truncate font-semibold text-base",
																!isEnabled && "text-slate-500",
															)}
														>
															{course.shortName} - {course.fullName}
														</h2>
														<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
															<MetaItem icon={Layers3}>
																{selectedSectionsCount} sections
															</MetaItem>
															<MetaItem icon={FileText}>
																{isEnabled
																	? `${matchingFilesCount} matching files`
																	: "0 selected"}
															</MetaItem>
															<MetaItem icon={RefreshCcw} tone="muted">
																{isEnabled
																	? (course.syncConfig?.useGlobalExtensions ??
																		true)
																		? `Uses global file types: ${extensionLabel}`
																		: "Custom file types"
																	: "Not syncing"}
															</MetaItem>
															<MetaItem
																icon={isEnabled ? CheckCircle2 : X}
																tone={course.driveFolder ? "success" : "muted"}
															>
																{course.driveFolder
																	? "Drive folder ready"
																	: "Drive folder not created"}
															</MetaItem>
														</div>
													</div>
												</div>

												<div className="flex flex-wrap items-center gap-2 lg:justify-end">
													<CourseBadge tone={statusTone}>
														{!isEnabled
															? "Disabled"
															: matchingFilesCount === 0
																? "Needs review"
																: "Enabled"}
													</CourseBadge>
													{course.driveFolder ? (
														<a
															className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 font-medium text-sm shadow-sm transition hover:bg-slate-50"
															href={course.driveFolder.folderUrl}
															rel="noopener"
															target="_blank"
														>
															<Folder className="size-4" />
															Open Drive folder
														</a>
													) : null}
													<form
														action={
															isEnabled
																? startCourseSyncAction
																: updateCourseConfigAction
														}
													>
														<input
															name="courseId"
															type="hidden"
															value={course.id}
														/>
														{isEnabled ? null : (
															<>
																<input
																	name="enabled"
																	type="hidden"
																	value="on"
																/>
																<input
																	name="extensions"
																	type="hidden"
																	value={course.syncConfig?.extensionsCsv ?? ""}
																/>
																{(course.syncConfig?.useGlobalExtensions ??
																true) ? (
																	<input
																		name="useGlobalExtensions"
																		type="hidden"
																		value="on"
																	/>
																) : null}
															</>
														)}
														<PendingButton
															className="h-9"
															pendingLabel={
																isEnabled ? "Syncing..." : "Enabling..."
															}
															variant={isEnabled ? "outline" : "default"}
														>
															<RefreshCcw className="size-4" />
															{isEnabled ? "Sync This Course" : "Enable Course"}
														</PendingButton>
													</form>
													{isExpanded ? (
														<ChevronUp className="size-4 text-slate-700" />
													) : (
														<ChevronDown className="size-4 text-slate-700" />
													)}
												</div>
											</div>

											{isExpanded ? (
												<div className="grid gap-3 border-slate-100 border-t px-4 pt-0 pb-4 lg:grid-cols-[420px_minmax(0,1fr)]">
													<section className="rounded-lg border border-slate-200 p-4">
														<h3 className="font-semibold text-base">
															Course settings
														</h3>
														<div className="mt-5 space-y-4">
															<div>
																<p className="font-semibold text-xs">
																	Sync status
																</p>
																<div className="mt-2 flex gap-2 text-sm">
																	<span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-emerald-500" />
																	<p>
																		Enabled - new matching files in selected
																		sections will sync automatically.
																	</p>
																</div>
															</div>

															<form
																action={updateCourseConfigAction}
																className="space-y-4"
															>
																<input
																	name="courseId"
																	type="hidden"
																	value={course.id}
																/>
																<input
																	name="enabled"
																	type="hidden"
																	value="on"
																/>
																<div className="flex items-center justify-between border-slate-200 border-t pt-4">
																	<p className="font-semibold text-sm">
																		Use global file types
																	</p>
																	<AutoSubmitCheckbox
																		defaultChecked={
																			course.syncConfig?.useGlobalExtensions ??
																			true
																		}
																		mode="switch"
																		name="useGlobalExtensions"
																	/>
																</div>
																<div className="space-y-3 border-slate-200 border-t pt-4">
																	<p className="font-semibold text-sm">
																		Allowed extensions
																	</p>
																	<div className="flex flex-wrap gap-2">
																		<ExtensionEditor
																			defaultValue={
																				course.syncConfig?.useGlobalExtensions
																					? activeExtensions.join(",")
																					: (course.syncConfig?.extensionsCsv ??
																						"")
																			}
																			name="extensions"
																		/>
																	</div>
																	<p className="text-muted-foreground text-xs">
																		Only files with these extensions will be
																		uploaded for this course.
																	</p>
																</div>
																<div className="space-y-2 border-slate-200 border-t pt-4">
																	<p className="font-semibold text-sm">
																		Google Drive folder
																	</p>
																	<div className="flex items-center justify-between gap-3">
																		<a
																			className="truncate font-medium text-primary text-sm hover:underline"
																			href={
																				course.driveFolder?.folderUrl ?? "#"
																			}
																			rel="noopener"
																			target="_blank"
																		>
																			Moodle Study Sync / {course.shortName}
																		</a>
																		<CopyButton
																			text={course.driveFolder?.folderUrl ?? ""}
																		/>
																	</div>
																</div>
															</form>

															<div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-900 text-sm">
																<Info className="mt-0.5 size-5 shrink-0" />
																<p>
																	Disabling this course stops future syncs.
																	Files already uploaded to Drive remain there.
																</p>
															</div>
														</div>
													</section>

													<section className="rounded-lg border border-slate-200 p-4">
														<h3 className="font-semibold text-base">
															Sections
														</h3>
														<div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
															<div className="grid grid-cols-[minmax(0,1fr)_112px] bg-slate-50 px-4 py-2 font-medium text-muted-foreground text-xs">
																<span>Section</span>
																<span>Matching files</span>
															</div>
															<div className="divide-y divide-slate-100">
																{course.sections.map((section, index) => {
																	const sectionMatchingFiles =
																		countSectionFiles(
																			courseFiles,
																			section.id,
																			activeExtensions,
																		);
																	const sampleFiles = courseFiles
																		.filter(
																			(file) =>
																				file.sectionId === section.id &&
																				matchesExtension(
																					file.filename,
																					activeExtensions,
																				),
																		)
																		.slice(0, 3);

																	return (
																		<div key={section.id}>
																			<form
																				action={updateSectionSelectionAction}
																				className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-3 px-4 py-2.5 text-sm"
																			>
																				<input
																					name="sectionId"
																					type="hidden"
																					value={section.id}
																				/>
																				<label className="flex min-w-0 items-center gap-3 font-medium">
																					<AutoSubmitCheckbox
																						defaultChecked={
																							section.syncConfig?.selected !==
																							false
																						}
																						name="selected"
																					/>
																					<span className="truncate">
																						{section.name}
																					</span>
																				</label>
																				<span className="text-right text-muted-foreground">
																					{sectionMatchingFiles} files
																				</span>
																			</form>
																			{index === 0 && sampleFiles.length > 0 ? (
																				<div className="space-y-2 bg-blue-50/40 px-12 py-3 text-sm">
																					{sampleFiles.map((file) => (
																						<div
																							className="flex items-center gap-2 text-slate-700"
																							key={file.fileKey}
																						>
																							<FileText className="size-4 text-rose-500" />
																							<span className="truncate">
																								{file.filename}
																							</span>
																						</div>
																					))}
																				</div>
																			) : null}
																		</div>
																	);
																})}
															</div>
														</div>
														<p className="mt-4 text-muted-foreground text-xs">
															Selected sections are included in future syncs.
														</p>
													</section>
												</div>
											) : null}
										</article>
									);
								},
							)
						)}
					</div>
				</div>

				<aside className="hidden xl:block">
					<div className="sticky top-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex items-center justify-between gap-3">
							<h2 className="font-semibold">How course syncing works</h2>
							<span className="grid size-6 place-items-center rounded-full border border-blue-200 text-primary">
								?
							</span>
						</div>
						<ol className="mt-6 space-y-7">
							{[
								"Enable a course to include it in scheduled syncs.",
								"Select the sections you want to watch.",
								"Use global PDF-only sync or define custom extensions per course.",
								"Existing Drive files are kept even if a course is later disabled.",
							].map((item, index) => (
								<li className="flex gap-4 text-sm" key={item}>
									<span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 font-semibold text-primary">
										{index + 1}
									</span>
									<span className="pt-1 text-slate-700 leading-6">{item}</span>
								</li>
							))}
						</ol>
					</div>
				</aside>
			</div>
		</div>
	);
}
