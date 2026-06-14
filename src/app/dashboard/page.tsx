import {
	CalendarClock,
	CheckCircle2,
	Clock3,
	FolderSync,
	PlayIcon,
	RefreshCcwIcon,
	StopCircleIcon,
} from "lucide-react";

import {
	cancelSyncAction,
	refreshMetadataAction,
	startSyncAction,
} from "~/app/actions";
import { PageHeader } from "~/app/page-header";
import { StatusPill } from "~/app/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { loadDashboardPageData } from "~/server/app-state";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

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
	const lastRun = data.lastRun;

	return (
		<div className="space-y-5">
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
				description="Monitor Moodle and Google Drive connections."
				title="Dashboard"
			/>

			<div className="grid gap-3 xl:grid-cols-4">
				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="pb-1">
						<CardTitle className="flex items-center gap-2 text-sm">
							<span className="grid size-7 place-items-center rounded-full bg-orange-50 text-orange-600">
								m
							</span>
							Moodle Connected
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<StatusPill
							status={data.moodle.credentialsSaved ? "Connected" : null}
						/>
						<div className="grid gap-2 text-xs">
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">Site URL</span>
								<span className="truncate">{data.moodle.baseUrl}</span>
							</div>
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">User</span>
								<span className="truncate">
									{data.moodle.username ?? "Not saved"}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="pb-1">
						<CardTitle className="flex items-center gap-2 text-sm">
							<span className="grid size-7 place-items-center rounded-full bg-blue-50 text-blue-600">
								<FolderSync className="size-4" />
							</span>
							Google Drive
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<StatusPill
							status={data.google.hasRefreshToken ? "Connected" : null}
						/>
						<div className="grid gap-2 text-xs">
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">Account</span>
								<span className="truncate">
									{data.google.connectedEmail ?? "Not connected"}
								</span>
							</div>
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">Folder</span>
								<span className="truncate">
									{data.google.driveRootFolderId ?? "Not created"}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="pb-1">
						<CardTitle className="flex items-center gap-2 text-sm">
							<span className="grid size-7 place-items-center rounded-full bg-blue-50 text-primary">
								<Clock3 className="size-4" />
							</span>
							Last Sync
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<StatusPill
							status={data.isSyncRunning ? "RUNNING" : lastRun?.status}
						/>
						<div className="grid gap-2 text-xs">
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">Today</span>
								<span className="truncate">
									{lastRun ? formatDate(lastRun.startedAt) : "Not yet"}
								</span>
							</div>
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">Processed</span>
								<span>{data.app.activeRunProcessed} files</span>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="pb-1">
						<CardTitle className="flex items-center gap-2 text-sm">
							<span className="grid size-7 place-items-center rounded-full bg-blue-50 text-primary">
								<CalendarClock className="size-4" />
							</span>
							Next Scheduled Sync
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-xs">
						<p className="font-semibold text-base">
							{data.app.scheduleEnabled ? data.app.scheduleTime : "Disabled"}
						</p>
						<div className="grid gap-2">
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">Next run</span>
								<span>{formatDate(data.nextScheduledRun)}</span>
							</div>
							<div className="grid grid-cols-[70px_1fr] gap-2">
								<span className="text-muted-foreground">Timezone</span>
								<span>{data.app.scheduleTimezone}</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
				<CardHeader className="border-slate-100 border-b">
					<div className="flex items-center justify-between">
						<CardTitle className="text-sm">Recent Activity</CardTitle>
						<a
							className="font-medium text-primary text-xs hover:underline"
							href="/logs"
						>
							View all logs
						</a>
					</div>
				</CardHeader>
				<CardContent className="pt-1">
					{data.recentRuns.length === 0 ? (
						<p className="py-8 text-center text-muted-foreground text-sm">
							No sync runs yet.
						</p>
					) : (
						<div className="divide-y divide-slate-100">
							{data.recentRuns.map((run) => (
								<div
									className="grid gap-3 py-3 text-sm md:grid-cols-[1fr_170px_230px_auto] md:items-center"
									key={run.id}
								>
									<div className="flex items-center gap-3">
										<CheckCircle2 className="size-4 text-emerald-600" />
										<p className="font-medium text-foreground">
											Sync{" "}
											{run.status === "SUCCESS"
												? "completed successfully"
												: run.trigger.replaceAll("_", " ").toLowerCase()}
										</p>
									</div>
									<p className="text-muted-foreground text-xs">
										{formatDate(run.startedAt)}
									</p>
									<p className="text-muted-foreground text-xs">
										Uploaded {run.filesUploaded}, updated {run.filesUpdated},
										skipped {run.filesSkipped}
									</p>
									<StatusPill status={run.status} />
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
