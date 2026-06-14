import {
	CheckCircle2,
	ExternalLink,
	KeyRound,
	Link2,
	LockKeyhole,
	ShieldCheck,
} from "lucide-react";

import {
	clearGoogleConnectionAction,
	clearMoodleCredentialsAction,
	pollGoogleDeviceFlowAction,
	saveGoogleClientCredentialsAction,
	saveMoodleCredentialsAction,
	saveScheduleAction,
	startGoogleDeviceFlowAction,
	testMoodleConnectionAction,
} from "~/app/actions";
import { PendingButton, SecretInput } from "~/app/form-feedback";
import { PageHeader } from "~/app/page-header";
import { StatusPill } from "~/app/status-pill";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { loadSetupPageData } from "~/server/app-state";
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

function SavedNotice({
	children,
	enabled,
}: {
	children: React.ReactNode;
	enabled: boolean;
}) {
	return (
		<div
			className={
				enabled
					? "flex items-start gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800 text-xs"
					: "flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 text-xs"
			}
		>
			<CheckCircle2
				className={
					enabled
						? "mt-0.5 size-4 shrink-0"
						: "mt-0.5 size-4 shrink-0 text-slate-400"
				}
			/>
			<p>{enabled ? children : "Complete this step to enable sync."}</p>
		</div>
	);
}

export default async function SetupPage() {
	const data = await loadSetupPageData(db);
	const googleDeviceFlow = data.google.hasRefreshToken
		? null
		: data.googleDeviceFlow;

	return (
		<div className="space-y-5">
			<PageHeader
				description="Configure Moodle and Google Drive connections."
				title="Setup"
			/>

			<div className="grid gap-4 xl:grid-cols-2">
				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="border-slate-100 border-b">
						<div className="flex items-center justify-between gap-3">
							<CardTitle className="flex items-center gap-2 text-sm">
								<span className="grid size-7 place-items-center rounded-full bg-orange-50 text-orange-600">
									m
								</span>
								Moodle Settings
							</CardTitle>
							<StatusPill
								status={data.moodle.credentialsSaved ? "Connected" : null}
							/>
						</div>
						<CardDescription>
							Last verified: {formatDate(data.moodle.tokenUpdatedAt)}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<SavedNotice enabled={data.moodle.credentialsSaved}>
							Moodle credentials are encrypted and ready for sync.
						</SavedNotice>

						<form action={saveMoodleCredentialsAction} className="space-y-3">
							<div className="space-y-1.5">
								<Label htmlFor="moodle-base-url">Base URL</Label>
								<Input
									defaultValue={data.moodle.baseUrl}
									id="moodle-base-url"
									name="baseUrl"
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="moodle-organization">Organization</Label>
								<Input
									defaultValue={data.moodle.organization}
									id="moodle-organization"
									name="organization"
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="moodle-username">Username</Label>
								<Input
									autoComplete="username"
									defaultValue={data.moodle.username ?? ""}
									id="moodle-username"
									name="username"
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="moodle-password">Password</Label>
								<SecretInput
									autoComplete="current-password"
									id="moodle-password"
									name="password"
									required
									revealedLabel="Moodle password"
								/>
							</div>
							<div className="flex flex-wrap gap-2 pt-1">
								<PendingButton pendingLabel="Saving...">
									<LockKeyhole className="size-4" />
									Save Credentials
								</PendingButton>
							</div>
						</form>

						<div className="flex flex-wrap gap-2">
							<form action={testMoodleConnectionAction}>
								<PendingButton pendingLabel="Testing..." variant="outline">
									<ShieldCheck className="size-4" />
									Test Moodle Login
								</PendingButton>
							</form>
							<form action={clearMoodleCredentialsAction}>
								<PendingButton pendingLabel="Clearing..." variant="secondary">
									Clear Moodle Credentials
								</PendingButton>
							</form>
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
					<CardHeader className="border-slate-100 border-b">
						<div className="flex items-center justify-between gap-3">
							<CardTitle className="flex items-center gap-2 text-sm">
								<span className="grid size-7 place-items-center rounded-full bg-blue-50 text-primary">
									<KeyRound className="size-4" />
								</span>
								Google Drive Setup
							</CardTitle>
							<StatusPill
								status={data.google.hasRefreshToken ? "Connected" : null}
							/>
						</div>
						<CardDescription>
							Account: {data.google.connectedEmail ?? "Not connected"}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<SavedNotice enabled={data.google.hasRefreshToken}>
							Google Drive is connected and can receive uploaded files.
						</SavedNotice>

						<form
							action={saveGoogleClientCredentialsAction}
							className="space-y-3"
						>
							<div className="space-y-1.5">
								<Label htmlFor="google-client-id">Client ID</Label>
								<Input
									autoComplete="off"
									defaultValue={data.google.clientId ?? ""}
									id="google-client-id"
									name="clientId"
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="google-client-secret">Client Secret</Label>
								<SecretInput
									autoComplete="off"
									id="google-client-secret"
									name="clientSecret"
									required
									revealedLabel="Google client secret"
								/>
							</div>
							<PendingButton pendingLabel="Saving...">
								<LockKeyhole className="size-4" />
								Save Google Client
							</PendingButton>
						</form>

						<div className="flex flex-wrap gap-2">
							<form action={startGoogleDeviceFlowAction}>
								<PendingButton pendingLabel="Starting...">
									<Link2 className="size-4" />
									Connect Google Drive
								</PendingButton>
							</form>
							<form action={pollGoogleDeviceFlowAction}>
								<PendingButton pendingLabel="Checking..." variant="outline">
									Verify Device Flow
								</PendingButton>
							</form>
							<form action={clearGoogleConnectionAction}>
								<PendingButton
									pendingLabel="Disconnecting..."
									variant="secondary"
								>
									Disconnect
								</PendingButton>
							</form>
						</div>

						{googleDeviceFlow ? (
							<div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-blue-950 text-sm">
								<p className="font-semibold">Device Flow (Recommended)</p>
								<div className="grid gap-3">
									<div className="flex gap-3">
										<span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary font-semibold text-[11px] text-primary-foreground">
											1
										</span>
										<div>
											<p className="text-xs">
												Enter this code on the Google device login page.
											</p>
											<p className="mt-2 rounded-md border border-blue-200 bg-white px-4 py-2 text-center font-semibold text-2xl text-primary tracking-[0.16em]">
												{googleDeviceFlow.userCode}
											</p>
										</div>
									</div>
									<div className="flex gap-3">
										<span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary font-semibold text-[11px] text-primary-foreground">
											2
										</span>
										<div className="min-w-0 flex-1">
											<p className="text-xs">
												Open the verification URL, finish Google approval, then
												verify.
											</p>
											<a
												className="mt-2 flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-white px-3 py-2 font-medium text-primary text-xs hover:underline"
												href={googleDeviceFlow.verificationUrl}
												rel="noreferrer noopener"
												target="_blank"
											>
												<span className="truncate">
													{googleDeviceFlow.verificationUrl}
												</span>
												<ExternalLink className="size-3.5 shrink-0" />
											</a>
										</div>
									</div>
								</div>
								<form action={pollGoogleDeviceFlowAction}>
									<PendingButton className="w-full" pendingLabel="Verifying...">
										I entered the code, verify now
									</PendingButton>
								</form>
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>

			<Card className="rounded-lg border-slate-200 bg-white shadow-sm">
				<CardHeader className="border-slate-100 border-b">
					<CardTitle className="text-sm">Daily Sync Defaults</CardTitle>
					<CardDescription>
						Recurring sync time and global allowed file extensions.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						action={saveScheduleAction}
						className="grid gap-4 lg:grid-cols-[1fr_180px_220px]"
					>
						<div className="space-y-1.5 lg:col-span-3">
							<Label htmlFor="global-extensions">
								Global allowed extensions
							</Label>
							<Textarea
								defaultValue={data.app.globalExtensionsCsv}
								id="global-extensions"
								name="globalExtensions"
								placeholder="pdf, pptx, docx"
							/>
						</div>
						<div className="flex items-center gap-2 pt-6">
							<input
								className="size-4 rounded border-slate-300 accent-blue-600"
								defaultChecked={data.app.scheduleEnabled}
								id="schedule-enabled"
								name="enabled"
								type="checkbox"
							/>
							<Label htmlFor="schedule-enabled">Enable daily sync</Label>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="schedule-time">Run at</Label>
							<Input
								defaultValue={data.app.scheduleTime}
								id="schedule-time"
								name="time"
								type="time"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="schedule-timezone">Timezone</Label>
							<Input
								defaultValue={data.app.scheduleTimezone}
								id="schedule-timezone"
								name="timezone"
							/>
						</div>
						<div className="lg:col-span-3">
							<PendingButton pendingLabel="Saving schedule...">
								Save Schedule
							</PendingButton>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
