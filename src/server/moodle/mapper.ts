import { createStableFileKey } from "~/server/core";

type MoodleContentFile = {
	filename?: string;
	filepath?: string;
	fileurl?: string;
	filesize?: number;
	mimetype?: string;
	timemodified?: number;
};

type MoodleModule = {
	contents?: MoodleContentFile[];
	id: number;
	modname?: string;
	name?: string;
	uservisible?: boolean;
	visible?: boolean | number;
};

type MoodleSection = {
	id?: number;
	modules?: MoodleModule[];
	name?: string;
	section?: number;
	uservisible?: boolean;
	visible?: boolean | number;
};

export function mapCourseContents(courseId: number, sections: MoodleSection[]) {
	const mappedSections: Array<{
		courseId: number;
		id: string;
		moodleSectionId: number | null;
		name: string;
		sectionIndex: number;
		userVisible: boolean | null;
		visible: boolean | null;
	}> = [];
	const mappedModules: Array<{
		courseId: number;
		id: number;
		moduleType: string;
		name: string;
		sectionId: string;
		userVisible: boolean | null;
		visible: boolean | null;
	}> = [];
	const mappedFiles: Array<{
		courseId: number;
		fileKey: string;
		filename: string;
		filepath: string | null;
		fileSize: number;
		fileUrl: string;
		lastSeenAt: Date;
		mimeType: string | null;
		moduleId: number;
		moduleName: string;
		sectionId: string;
		sectionName: string;
		timeModified: number;
	}> = [];

	for (const section of sections) {
		const sectionIndex = section.section ?? 0;
		const sectionId = `${courseId}:${sectionIndex}`;
		const sectionName = section.name?.trim() || `Section ${sectionIndex}`;

		mappedSections.push({
			courseId,
			id: sectionId,
			moodleSectionId: section.id ?? null,
			name: sectionName,
			sectionIndex,
			userVisible: section.uservisible ?? null,
			visible:
				typeof section.visible === "number"
					? section.visible === 1
					: (section.visible ?? null),
		});

		for (const module of section.modules ?? []) {
			mappedModules.push({
				courseId,
				id: module.id,
				moduleType: module.modname ?? "unknown",
				name: module.name?.trim() || `Module ${module.id}`,
				sectionId,
				userVisible: module.uservisible ?? null,
				visible:
					typeof module.visible === "number"
						? module.visible === 1
						: (module.visible ?? null),
			});

			for (const content of module.contents ?? []) {
				if (!(content.fileurl && content.filename)) {
					continue;
				}

				mappedFiles.push({
					courseId,
					fileKey: createStableFileKey({
						courseId,
						fileUrlOrPath: content.fileurl,
						filename: content.filename,
						moduleId: module.id,
						sectionId,
					}),
					filename: content.filename,
					filepath: content.filepath ?? null,
					fileSize: content.filesize ?? 0,
					fileUrl: content.fileurl,
					lastSeenAt: new Date(),
					mimeType: content.mimetype ?? null,
					moduleId: module.id,
					moduleName: module.name?.trim() || `Module ${module.id}`,
					sectionId,
					sectionName,
					timeModified: content.timemodified ?? 0,
				});
			}
		}
	}

	return {
		files: mappedFiles,
		modules: mappedModules,
		sections: mappedSections,
	};
}
