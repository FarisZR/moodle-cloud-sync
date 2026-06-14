import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
		<div className="rounded-[28px] border border-white/70 bg-white/90 px-6 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="space-y-2">
					{badge ? (
						<Badge className="bg-blue-50 text-blue-700" variant="secondary">
							{badge}
						</Badge>
					) : null}
					<div>
						<h1 className="font-semibold text-3xl text-slate-950 tracking-tight">
							{title}
						</h1>
						<p className="mt-1 max-w-2xl text-slate-500">{description}</p>
					</div>
				</div>

				{actions.length > 0 ? (
					<div className="flex flex-wrap items-center gap-3">
						{actions.map((action) => (
							<form action={action.formAction} key={action.id}>
								<Button
									className={cn(
										action.variant === "default" &&
											"shadow-blue-600/20 shadow-lg",
									)}
									name={action.name}
									value={action.value}
									variant={action.variant ?? "outline"}
								>
									{action.children}
								</Button>
							</form>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
