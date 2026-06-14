import { ChevronDown, ExternalLink, FileText, Folder } from "lucide-react";

import {
	startCourseSyncAction,
	updateCourseConfigAction,
	updateSectionSelectionAction,
} from "~/app/actions";
import { AutoSubmitCheckbox, PendingButton } from "~/app/form-feedback";
import { PageHeader } from "~/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { loadCoursesPageData } from "~/server/app-state";
import { db } from "~/server/db";

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

export default async function CoursesPage() {
	const data = await loadCoursesPageData(db);

	return (
		<div className="space-y-5">
			<PageHeader
				description="Select courses and sections to sync to Google Drive."
				title="Courses"
			/>

			<div className="space-y-3">
				{data.courses.length === 0 ? (
					<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
						<CardContent className="py-10 text-center text-muted-foreground">
							No Moodle courses discovered yet. Run metadata refresh from the
							dashboard after connecting Moodle.
						</CardContent>
					</Card>
				) : (
					data.courses.map(({ course, selectedSectionsCount }) => {
						const isEnabled = course.syncConfig?.enabled ?? false;
						const activeExtensions =
							(course.syncConfig?.useGlobalExtensions ?? true)
								? data.globalExtensions
								: splitExtensions(course.syncConfig?.extensionsCsv ?? "");
						const extensionLabel = formatExtensions(activeExtensions);
						const courseFiles = course.files ?? [];

						return (
							<Card
								className="rounded-lg border-slate-200 bg-white shadow-sm"
								key={course.id}
							>
								<CardHeader className="py-3">
									<div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
										<div className="flex min-w-0 items-center gap-3">
											<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
											<form
												action={updateCourseConfigAction}
												className="flex shrink-0 items-center"
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
												{(course.syncConfig?.useGlobalExtensions ?? true) ? (
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
											<div className="min-w-0">
												<CardTitle className="truncate text-sm">
													{course.shortName} - {course.fullName}
												</CardTitle>
											</div>
										</div>
										<div className="flex flex-wrap items-center gap-4 text-muted-foreground text-xs">
											<span className="inline-flex items-center gap-1">
												<FileText className="size-3.5" />
												{selectedSectionsCount} sections
											</span>
											<span className="inline-flex items-center gap-1">
												<FileText className="size-3.5" />
												{extensionLabel}
											</span>
											{course.driveFolder ? (
												<a
													className="inline-flex items-center gap-1 text-primary hover:underline"
													href={course.driveFolder.folderUrl}
													rel="noopener"
													target="_blank"
												>
													<Folder className="size-3.5" />
													Drive / {course.shortName}
													<ExternalLink className="size-3" />
												</a>
											) : (
												<span className="inline-flex items-center gap-1">
													<Folder className="size-3.5" />
													No Drive folder yet
												</span>
											)}
											<form action={startCourseSyncAction}>
												<input
													name="courseId"
													type="hidden"
													value={course.id}
												/>
												<PendingButton
													className="h-8"
													disabled={!isEnabled}
													pendingLabel="Syncing..."
													variant="outline"
												>
													Sync This Course
												</PendingButton>
											</form>
										</div>
									</div>
								</CardHeader>

								{isEnabled ? (
									<CardContent className="pt-0">
										<div className="grid overflow-hidden rounded-lg border border-slate-200 md:grid-cols-[300px_1fr]">
											<form
												action={updateCourseConfigAction}
												className="space-y-3 bg-white p-4 md:border-slate-200 md:border-r"
											>
												<input
													name="courseId"
													type="hidden"
													value={course.id}
												/>
												<input name="enabled" type="hidden" value="on" />
												<div className="space-y-1.5">
													<Label htmlFor={`course-extensions-${course.id}`}>
														Allowed Extensions
													</Label>
													<Input
														defaultValue={
															course.syncConfig?.extensionsCsv ?? ""
														}
														id={`course-extensions-${course.id}`}
														name="extensions"
														placeholder="pdf, pptx, docx"
													/>
													<p className="text-muted-foreground text-xs">
														Comma-separated list of allowed file extensions.
													</p>
												</div>
												<div className="flex items-center justify-between gap-3">
													<label className="flex items-center gap-2">
														<input
															className="size-4 rounded border-slate-300 accent-blue-600"
															defaultChecked={
																course.syncConfig?.useGlobalExtensions ?? true
															}
															name="useGlobalExtensions"
															type="checkbox"
														/>
														<span className="font-medium text-sm">
															Use global
														</span>
													</label>
													<PendingButton
														className="h-8 min-w-16"
														pendingLabel="Saving..."
														variant="outline"
													>
														Save
													</PendingButton>
												</div>
											</form>

											<div className="min-w-0 bg-white">
												<div className="grid grid-cols-[1fr_140px] border-slate-200 border-b bg-slate-50 px-4 py-2 font-medium text-muted-foreground text-xs">
													<span>Section</span>
													<span>Matching Files</span>
												</div>
												<div className="divide-y divide-slate-100">
													{course.sections.map((section) => {
														const sectionMatchingFiles = courseFiles.filter(
															(file) =>
																file.sectionId === section.id &&
																matchesExtension(
																	file.filename,
																	activeExtensions,
																),
														).length;

														return (
															<form
																action={updateSectionSelectionAction}
																className="grid grid-cols-[1fr_140px] items-center gap-3 px-4 py-2.5 text-sm"
																key={section.id}
															>
																<input
																	name="sectionId"
																	type="hidden"
																	value={section.id}
																/>
																<label className="flex min-w-0 items-center gap-3">
																	<AutoSubmitCheckbox
																		defaultChecked={
																			section.syncConfig?.selected !== false
																		}
																		name="selected"
																	/>
																	<span className="truncate">
																		{section.name}
																	</span>
																</label>
																<span className="text-muted-foreground text-xs">
																	{sectionMatchingFiles} files
																</span>
															</form>
														);
													})}
												</div>
											</div>
										</div>
									</CardContent>
								) : null}
							</Card>
						);
					})
				)}
			</div>
		</div>
	);
}
