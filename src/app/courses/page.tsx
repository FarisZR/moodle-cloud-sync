import {
	startCourseSyncAction,
	updateCourseConfigAction,
	updateSectionSelectionAction,
} from "~/app/actions";
import { PageHeader } from "~/app/page-header";
import { StatusPill } from "~/app/status-pill";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { loadCoursesPageData } from "~/server/app-state";
import { db } from "~/server/db";

export default async function CoursesPage() {
	const data = await loadCoursesPageData(db);

	return (
		<div className="space-y-6">
			<PageHeader
				description="Enable courses, choose sections, control file extensions, and trigger one-course sync runs."
				title="Courses"
			/>

			<div className="space-y-4">
				{data.courses.length === 0 ? (
					<Card>
						<CardContent className="py-10 text-center text-slate-500">
							No Moodle courses discovered yet. Run metadata refresh from the
							dashboard after connecting Moodle.
						</CardContent>
					</Card>
				) : (
					data.courses.map(
						({ course, matchingFilesCount, selectedSectionsCount }) => (
							<Card key={course.id}>
								<CardHeader>
									<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
										<div>
											<CardTitle>{course.fullName}</CardTitle>
											<CardDescription>{course.shortName}</CardDescription>
										</div>
										<div className="flex flex-wrap items-center gap-3 text-slate-500 text-sm">
											<StatusPill
												status={course.syncConfig?.lastSyncStatus ?? null}
											/>
											<span>{selectedSectionsCount} sections selected</span>
											<span>{matchingFilesCount} matching files</span>
											{course.driveFolder ? (
												<a
													className="text-blue-600 hover:underline"
													href={course.driveFolder.folderUrl}
													rel="noopener"
													target="_blank"
												>
													Open Drive folder
												</a>
											) : (
												<span>No Drive folder yet</span>
											)}
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-6">
									<form
										action={updateCourseConfigAction}
										className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 lg:grid-cols-[160px_1fr_220px]"
									>
										<input name="courseId" type="hidden" value={course.id} />
										<div className="space-y-2">
											<Label htmlFor={`course-enabled-${course.id}`}>
												Enable course
											</Label>
											<input
												defaultChecked={course.syncConfig?.enabled ?? false}
												id={`course-enabled-${course.id}`}
												name="enabled"
												type="checkbox"
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor={`course-extensions-${course.id}`}>
												Allowed extensions
											</Label>
											<Input
												defaultValue={course.syncConfig?.extensionsCsv ?? ""}
												id={`course-extensions-${course.id}`}
												name="extensions"
												placeholder="pdf, zip, ipynb"
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor={`course-use-global-${course.id}`}>
												Use global file types
											</Label>
											<input
												defaultChecked={
													course.syncConfig?.useGlobalExtensions ?? true
												}
												id={`course-use-global-${course.id}`}
												name="useGlobalExtensions"
												type="checkbox"
											/>
										</div>
										<div className="flex flex-wrap gap-3 lg:col-span-3">
											<Button type="submit">Save Course Settings</Button>
										</div>
									</form>

									<form action={startCourseSyncAction}>
										<input name="courseId" type="hidden" value={course.id} />
										<Button type="submit" variant="outline">
											Sync This Course
										</Button>
									</form>

									<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
										{course.sections.map((section) => (
											<form
												action={updateSectionSelectionAction}
												className="rounded-2xl border border-slate-100 p-4"
												key={section.id}
											>
												<input
													name="sectionId"
													type="hidden"
													value={section.id}
												/>
												<div className="flex items-start gap-3">
													<input
														className="mt-1 h-4 w-4 rounded border-slate-300"
														defaultChecked={
															section.syncConfig?.selected !== false
														}
														name="selected"
														type="checkbox"
													/>
													<div className="space-y-1">
														<p className="font-medium text-slate-900">
															{section.name}
														</p>
														<p className="text-slate-500 text-sm">
															Section {section.sectionIndex}
														</p>
													</div>
												</div>
												<Button
													className="mt-4"
													type="submit"
													variant="outline"
												>
													Save Section
												</Button>
											</form>
										))}
									</div>
								</CardContent>
							</Card>
						),
					)
				)}
			</div>
		</div>
	);
}
