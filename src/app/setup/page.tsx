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

const buttonClass =
	"inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2.5 font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const primaryButtonClass = `${buttonClass} bg-primary text-primary-foreground hover:bg-primary/80`;
const outlineButtonClass = `${buttonClass} border-border bg-background text-foreground hover:bg-muted`;
const secondaryButtonClass = `${buttonClass} bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]`;

export default async function SetupPage() {
	const data = await loadSetupPageData(db);

	return (
		<div className="space-y-6">
			<PageHeader
				description="Configure Moodle credentials, Google Drive device authorization, and the daily sync defaults."
				title="Setup"
			/>

			<div className="grid gap-4 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Moodle Settings</CardTitle>
						<CardDescription>
							Store DHBW Moodle login details and verify the mobile token flow.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<StatusPill
								status={data.moodle.credentialsSaved ? "Connected" : null}
							/>
							<p className="text-slate-500 text-sm">
								Last refresh:{" "}
								{data.moodle.tokenUpdatedAt
									? new Intl.DateTimeFormat("en-GB", {
											dateStyle: "medium",
											timeStyle: "short",
										}).format(data.moodle.tokenUpdatedAt)
									: "Not yet"}
							</p>
						</div>

						<form action={saveMoodleCredentialsAction} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="moodle-base-url">Base URL</Label>
								<Input
									defaultValue={data.moodle.baseUrl}
									id="moodle-base-url"
									name="baseUrl"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="moodle-organization">Organization</Label>
								<Input
									defaultValue={data.moodle.organization}
									id="moodle-organization"
									name="organization"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="moodle-username">Username</Label>
								<Input
									defaultValue={data.moodle.username ?? ""}
									id="moodle-username"
									name="username"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="moodle-password">Password</Label>
								<Input
									id="moodle-password"
									name="password"
									required
									type="password"
								/>
							</div>
							<div className="flex flex-wrap gap-3">
								<button className={primaryButtonClass} type="submit">
									Save Credentials
								</button>
							</div>
						</form>

						<div className="flex flex-wrap gap-3">
							<form action={testMoodleConnectionAction}>
								<button className={outlineButtonClass} type="submit">
									Test Moodle Login
								</button>
							</form>
							<form action={clearMoodleCredentialsAction}>
								<button className={secondaryButtonClass} type="submit">
									Clear Moodle Credentials
								</button>
							</form>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Google Drive Setup</CardTitle>
						<CardDescription>
							Store a device-flow client and connect the app-managed Drive root
							folder.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<StatusPill
								status={data.google.hasRefreshToken ? "Connected" : null}
							/>
							<p className="text-slate-500 text-sm">
								Account: {data.google.connectedEmail ?? "Not connected"}
							</p>
						</div>

						<form
							action={saveGoogleClientCredentialsAction}
							className="space-y-4"
						>
							<div className="space-y-2">
								<Label htmlFor="google-client-id">Client ID</Label>
								<Input
									defaultValue={data.google.clientId ?? ""}
									id="google-client-id"
									name="clientId"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="google-client-secret">Client secret</Label>
								<Input
									id="google-client-secret"
									name="clientSecret"
									required
									type="password"
								/>
							</div>
							<button className={primaryButtonClass} type="submit">
								Save Google Client
							</button>
						</form>

						<div className="flex flex-wrap gap-3">
							<form action={startGoogleDeviceFlowAction}>
								<button className={primaryButtonClass} type="submit">
									Connect Google Drive
								</button>
							</form>
							<form action={pollGoogleDeviceFlowAction}>
								<button className={outlineButtonClass} type="submit">
									Poll Device Flow
								</button>
							</form>
							<form action={clearGoogleConnectionAction}>
								<button className={secondaryButtonClass} type="submit">
									Disconnect Google Drive
								</button>
							</form>
						</div>

						{data.googleDeviceFlow ? (
							<div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-blue-900 text-sm">
								<p className="font-medium">Device Flow (Recommended)</p>
								<p className="mt-2">
									User code:{" "}
									<span className="font-semibold tracking-[0.2em]">
										{data.googleDeviceFlow.userCode}
									</span>
								</p>
								<p className="mt-1">
									Verification URL: {data.googleDeviceFlow.verificationUrl}
								</p>
								<a
									className="inline-flex text-blue-700 underline underline-offset-4"
									href={data.googleDeviceFlow.verificationUrl}
									rel="noreferrer noopener"
									target="_blank"
								>
									Open Google pairing page
								</a>
								<p>
									After entering the code in Google, come back here and press
									poll.
								</p>
								<form action={pollGoogleDeviceFlowAction}>
									<button className={primaryButtonClass} type="submit">
										I finished pairing, poll now
									</button>
								</form>
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Daily Sync Defaults</CardTitle>
					<CardDescription>
						Manage the recurring schedule and the global allowed extension list.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						action={saveScheduleAction}
						className="grid gap-4 lg:grid-cols-[1fr_180px_220px]"
					>
						<div className="space-y-2 lg:col-span-3">
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
						<div className="space-y-2">
							<Label htmlFor="schedule-enabled">Enable daily sync</Label>
							<input
								className="h-4 w-4 rounded border-slate-300"
								defaultChecked={data.app.scheduleEnabled}
								id="schedule-enabled"
								name="enabled"
								type="checkbox"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="schedule-time">Run at</Label>
							<Input
								defaultValue={data.app.scheduleTime}
								id="schedule-time"
								name="time"
								type="time"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="schedule-timezone">Timezone</Label>
							<Input
								defaultValue={data.app.scheduleTimezone}
								id="schedule-timezone"
								name="timezone"
							/>
						</div>
						<div className="lg:col-span-3">
							<button className={primaryButtonClass} type="submit">
								Save Schedule
							</button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
