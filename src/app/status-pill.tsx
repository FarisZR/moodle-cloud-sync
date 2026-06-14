import { Badge } from "~/components/ui/badge";

export function StatusPill({ status }: { status: string | null | undefined }) {
	if (!status) {
		return <Badge variant="outline">Not configured</Badge>;
	}

	if (status === "RUNNING") {
		return (
			<Badge className="bg-amber-100 text-amber-700" variant="secondary">
				Running
			</Badge>
		);
	}

	if (status === "SUCCESS" || status === "Connected") {
		return (
			<Badge className="bg-emerald-100 text-emerald-700" variant="secondary">
				{status}
			</Badge>
		);
	}

	if (status === "PARTIAL") {
		return (
			<Badge className="bg-amber-100 text-amber-700" variant="secondary">
				Partial
			</Badge>
		);
	}

	if (status === "FAILED" || status === "CANCELLED") {
		return <Badge variant="destructive">{status}</Badge>;
	}

	return <Badge variant="outline">{status}</Badge>;
}
