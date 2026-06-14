import { PendingButton } from "~/app/form-feedback";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

type HeaderAction = {
	id: string;
	children: React.ReactNode;
	formAction?: (formData: FormData) => void | Promise<void>;
	name?: string;
	value?: string;
	variant?: "default" | "outline" | "secondary";
};

type PageHeaderProps = {
	actions?: HeaderAction[];
	badge?: string;
	description: string;
	title: string;
};

export function PageHeader({
	actions = [],
	badge,
	description,
	title,
}: PageHeaderProps) {
	return (
		<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
			<div className="min-w-0 space-y-1">
				{badge ? (
					<Badge
						className="gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"
						variant="secondary"
					>
						<span className="size-2 rounded-full bg-emerald-500 [animation:sync-pulse_1.7s_ease-in-out_infinite]" />
						{badge}
					</Badge>
				) : null}
				<div>
					<h1 className="font-semibold text-2xl text-foreground tracking-tight">
						{title}
					</h1>
					<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
						{description}
					</p>
				</div>
			</div>

			{actions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3">
					{actions.map((action) => (
						<form action={action.formAction} key={action.id}>
							<PendingButton
								className={cn(
									action.variant === "default" &&
										"shadow-[0_8px_18px_rgba(37,99,235,0.18)]",
								)}
								name={action.name}
								pendingLabel="Starting..."
								value={action.value}
								variant={action.variant ?? "outline"}
							>
								{action.children}
							</PendingButton>
						</form>
					))}
				</div>
			) : null}
		</div>
	);
}
