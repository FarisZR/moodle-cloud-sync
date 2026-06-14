import { RefreshCcw } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "~/app/page-header";
import { StatusPill } from "~/app/status-pill";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { loadLogsPageData } from "~/server/app-state";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

function formatDate(value: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(value);
}

function formatDuration(startedAt: Date, finishedAt: Date | null) {
	const end = finishedAt ?? new Date();
	const seconds = Math.max(
		0,
		Math.round((end.getTime() - startedAt.getTime()) / 1000),
	);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
		.toString()
		.padStart(2, "0")}`;
}

export default async function LogsPage({
	searchParams,
}: {
	searchParams?: Promise<{ run?: string }>;
} = {}) {
	const data = await loadLogsPageData(db);
	const params = await searchParams;
	const selectedRun =
		data.runs.find((run) => run.id === params?.run) ?? data.runs[0];

	return (
		<div className="space-y-5">
			<PageHeader
				actions={[
					{
						children: (
							<>
								<RefreshCcw className="size-4" />
								Refresh
							</>
						),
						id: "refresh-logs",
						variant: "outline",
					},
				]}
				description="Recent sync runs and detailed logs."
				title="Logs"
			/>

			<div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="border-slate-100 border-b">
						<CardTitle className="text-sm">Sync Runs</CardTitle>
						<CardDescription>
							The latest 25 sync and metadata runs.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{data.runs.length === 0 ? (
							<p className="py-8 text-center text-muted-foreground text-sm">
								No sync runs yet.
							</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[620px] text-left text-sm">
									<thead className="text-muted-foreground text-xs">
										<tr className="border-slate-100 border-b">
											<th className="py-2 pr-3 font-medium">Status</th>
											<th className="py-2 pr-3 font-medium">Time</th>
											<th className="py-2 pr-3 font-medium">Uploaded</th>
											<th className="py-2 pr-3 font-medium">Updated</th>
											<th className="py-2 pr-3 font-medium">Skipped</th>
											<th className="py-2 pr-3 font-medium">Duration</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{data.runs.map((run) => (
											<tr
												className={
													selectedRun?.id === run.id
														? "bg-blue-50/70"
														: undefined
												}
												key={run.id}
											>
												<td className="p-0" colSpan={6}>
													<Link
														className="grid grid-cols-[110px_1fr_80px_80px_80px_80px] items-center px-0 py-0 text-sm transition hover:bg-blue-50/60"
														href={`/logs?run=${encodeURIComponent(run.id)}`}
													>
														<span className="py-3 pr-3">
															<StatusPill status={run.status} />
														</span>
														<span className="py-3 pr-3 text-xs">
															{formatDate(run.startedAt)}
														</span>
														<span className="py-3 pr-3">
															{run.filesUploaded}
														</span>
														<span className="py-3 pr-3">
															{run.filesUpdated}
														</span>
														<span className="py-3 pr-3">
															{run.filesSkipped}
														</span>
														<span className="py-3 pr-3 text-xs">
															{formatDuration(run.startedAt, run.finishedAt)}
														</span>
													</Link>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="border-slate-100 border-b">
						<CardTitle className="text-sm">Log Details</CardTitle>
						<CardDescription>
							{selectedRun
								? `${selectedRun.trigger.replaceAll("_", " ")} - ${formatDate(
										selectedRun.startedAt,
									)}`
								: "No run selected"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{selectedRun ? (
							<div className="space-y-3">
								{selectedRun.errorMessage ? (
									<p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700 text-sm">
										{selectedRun.errorMessage}
									</p>
								) : null}
								<pre className="max-h-[560px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-[12px] text-slate-800 leading-5">
									{selectedRun.logText || "No log output recorded."}
								</pre>
							</div>
						) : (
							<p className="py-8 text-center text-muted-foreground text-sm">
								Run a sync to populate log details.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
