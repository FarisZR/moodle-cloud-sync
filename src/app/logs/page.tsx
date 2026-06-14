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

function formatDate(value: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(value);
}

export default async function LogsPage() {
	const data = await loadLogsPageData(db);

	return (
		<div className="space-y-6">
			<PageHeader
				description="Inspect recent sync runs, statuses, counters, and the raw text log written for each attempt."
				title="Logs"
			/>

			<Card>
				<CardHeader>
					<CardTitle>Sync Runs</CardTitle>
					<CardDescription>
						The latest 25 sync and metadata runs.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{data.runs.length === 0 ? (
						<p className="text-slate-500 text-sm">No sync runs yet.</p>
					) : (
						data.runs.map((run) => (
							<details
								className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
								key={run.id}
							>
								<summary className="flex cursor-pointer list-none items-center justify-between gap-4">
									<div>
										<p className="font-medium text-slate-900">
											{run.trigger.replaceAll("_", " ")}
										</p>
										<p className="text-slate-500 text-sm">
											{formatDate(run.startedAt)}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-3 text-slate-500 text-sm">
										<span>Uploaded {run.filesUploaded}</span>
										<span>Updated {run.filesUpdated}</span>
										<span>Skipped {run.filesSkipped}</span>
										<StatusPill status={run.status} />
									</div>
								</summary>
								<div className="mt-4 space-y-3 border-slate-200 border-t pt-4">
									{run.errorMessage ? (
										<p className="text-rose-600 text-sm">{run.errorMessage}</p>
									) : null}
									<pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-slate-100 text-xs leading-6">
										{run.logText || "No log output recorded."}
									</pre>
								</div>
							</details>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}
