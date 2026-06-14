import { PlayIcon, RefreshCcwIcon, StopCircleIcon } from "lucide-react";

import {
	cancelSyncAction,
	refreshMetadataAction,
	startSyncAction,
} from "~/app/actions";
import { PageHeader } from "~/app/page-header";
import { StatusPill } from "~/app/status-pill";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { loadDashboardPageData } from "~/server/app-state";
import { db } from "~/server/db";

function formatDate(value: Date | null | undefined) {
	if (!value) {
		return "Not yet";
	}

	return new Intl.DateTimeFormat("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(value);
}

export default async function DashboardPage() {
	const data = await loadDashboardPageData(db);

	return (
		<div className="space-y-6">
			<PageHeader
				actions={
					data.isSyncRunning
						? [
								{
									id: "cancel-sync",
									children: (
										<>
											<StopCircleIcon className="mr-2 size-4" />
											Cancel Sync
										</>
									),
									formAction: cancelSyncAction,
									variant: "secondary",
								},
							]
						: [
								{
									id: "run-sync",
									children: (
										<>
											<PlayIcon className="mr-2 size-4" />
											Run Sync Now
										</>
									),
									formAction: startSyncAction,
									variant: "default",
								},
								{
									id: "refresh-metadata",
									children: (
										<>
											<RefreshCcwIcon className="mr-2 size-4" />
											Refresh Moodle Metadata
										</>
									),
									formAction: refreshMetadataAction,
								},
							]
				}
				badge={data.isSyncRunning ? "Background sync active" : "Ready"}
				description="Monitor Moodle and Google Drive connection health, background sync activity, and recent outcomes."
				title="Dashboard"
			/>

			<div className="grid gap-4 lg:grid-cols-4">
				<Card>
					<CardHeader>
						<CardDescription>Moodle connection</CardDescription>
						<CardTitle>{data.moodle.baseUrl}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<StatusPill
							status={data.moodle.credentialsSaved ? "Connected" : null}
						/>
						<p className="text-slate-500 text-sm">
							User: {data.moodle.username ?? "Not saved"}
						</p>
						<p className="text-slate-500 text-sm">
							Last token refresh: {formatDate(data.moodle.tokenUpdatedAt)}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardDescription>Google Drive</CardDescription>
						<CardTitle>
							{data.google.connectedEmail ?? "Not connected"}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<StatusPill
							status={data.google.hasRefreshToken ? "Connected" : null}
						/>
						<p className="text-slate-500 text-sm">
							Root folder: {data.google.driveRootFolderId ?? "Not created"}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardDescription>Background sync</CardDescription>
						<CardTitle>{data.isSyncRunning ? "Running" : "Idle"}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<StatusPill status={data.app.activeRunStatus} />
						<p className="text-slate-500 text-sm">
							Processed: {data.app.activeRunProcessed} files
						</p>
						<p className="text-slate-500 text-sm">
							Current course: {data.app.activeRunCourseName ?? "None"}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardDescription>Schedule</CardDescription>
						<CardTitle>
							{data.app.scheduleEnabled ? data.app.scheduleTime : "Disabled"}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<p className="text-slate-500 text-sm">
							Timezone: {data.app.scheduleTimezone}
						</p>
						<p className="text-slate-500 text-sm">
							Next run: {formatDate(data.nextScheduledRun)}
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>Recent Activity</CardTitle>
						<CardDescription>
							The latest sync attempts and their outcomes.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{data.recentRuns.length === 0 ? (
							<p className="text-slate-500 text-sm">No sync runs yet.</p>
						) : (
							data.recentRuns.map((run) => (
								<div
									className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
									key={run.id}
								>
									<div>
										<p className="font-medium text-slate-900">
											{run.trigger.replaceAll("_", " ")}
										</p>
										<p className="text-slate-500 text-sm">
											{formatDate(run.startedAt)}
										</p>
										<p className="mt-1 text-slate-500 text-sm">
											Uploaded {run.filesUploaded}, updated {run.filesUpdated},
											skipped {run.filesSkipped}
										</p>
									</div>
									<StatusPill status={run.status} />
								</div>
							))
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Current State</CardTitle>
						<CardDescription>
							Latest summary and operator-visible errors.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 text-slate-600 text-sm">
						<div>
							<p className="font-medium text-slate-900">Last sync</p>
							<p>
								{data.lastRun
									? formatDate(data.lastRun.startedAt)
									: "No runs yet"}
							</p>
						</div>
						<div>
							<p className="font-medium text-slate-900">Last result</p>
							<div className="mt-2">
								<StatusPill status={data.lastRun?.status} />
							</div>
						</div>
						<div>
							<p className="font-medium text-slate-900">Most recent error</p>
							<p>
								{data.app.lastError ??
									data.moodle.lastError ??
									data.google.lastError ??
									"No active error"}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
