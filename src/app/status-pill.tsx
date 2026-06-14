import { Badge } from "~/components/ui/badge";

export function StatusPill({ status }: { status: string | null | undefined }) {
	if (!status) {
		return (
			<Badge
				className="rounded-full border-slate-200 bg-white text-slate-500"
				variant="outline"
			>
				Not configured
			</Badge>
		);
	}

	if (status === "RUNNING") {
		return (
			<Badge
				className="gap-1.5 rounded-full bg-amber-50 text-amber-700"
				variant="secondary"
			>
				<span className="size-1.5 rounded-full bg-amber-500 [animation:sync-pulse_1.3s_ease-in-out_infinite]" />
				Running
			</Badge>
		);
	}

	if (status === "SUCCESS" || status === "Connected") {
		return (
			<Badge
				className="gap-1.5 rounded-full bg-emerald-50 text-emerald-700"
				variant="secondary"
			>
				<span className="size-1.5 rounded-full bg-emerald-500" />
				{status}
			</Badge>
		);
	}

	if (status === "PARTIAL") {
		return (
			<Badge
				className="gap-1.5 rounded-full bg-amber-50 text-amber-700"
				variant="secondary"
			>
				<span className="size-1.5 rounded-full bg-amber-500" />
				Partial
			</Badge>
		);
	}

	if (status === "FAILED" || status === "CANCELLED") {
		return (
			<Badge className="rounded-full" variant="destructive">
				{status}
			</Badge>
		);
	}

	return (
		<Badge
			className="rounded-full border-slate-200 bg-white text-slate-600"
			variant="outline"
		>
			{status}
		</Badge>
	);
}
