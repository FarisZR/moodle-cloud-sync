import { BookOpen, FolderSync, House, Logs, Settings } from "lucide-react";
import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type AppShellProps = {
	children: React.ReactNode;
	currentPath: string;
};

const navigation = [
	{ href: "/", icon: House, label: "Dashboard" },
	{ href: "/setup", icon: Settings, label: "Setup" },
	{ href: "/courses", icon: BookOpen, label: "Courses" },
	{ href: "/logs", icon: Logs, label: "Logs" },
];

export function AppShell({ children, currentPath }: AppShellProps) {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.08),transparent_30%),linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)] text-slate-950">
			<div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 md:px-6 lg:px-8">
				<aside className="hidden w-72 shrink-0 rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:flex lg:flex-col">
					<div className="flex items-center gap-3">
						<div className="flex size-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-blue-600/20 shadow-lg">
							<FolderSync className="size-5" />
						</div>
						<div>
							<p className="font-semibold text-slate-950">Moodle Study Sync</p>
							<p className="text-slate-500 text-sm">Self-hosted sync utility</p>
						</div>
					</div>

					<nav className="mt-8 space-y-1">
						{navigation.map((item) => {
							const isActive = currentPath === item.href;

							return (
								<Link
									className={cn(
										"flex items-center gap-3 rounded-2xl px-4 py-3 font-medium text-sm transition",
										isActive
											? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100"
											: "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
									)}
									href={item.href}
									key={item.href}
								>
									<item.icon className="size-4" />
									{item.label}
								</Link>
							);
						})}
					</nav>

					<div className="mt-auto space-y-4 pt-6">
						<div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
							<Badge
								className="bg-emerald-100 text-emerald-700"
								variant="secondary"
							>
								Self-hosted
							</Badge>
							<p className="mt-3 font-medium text-slate-900">Version 1.0.0</p>
							<p className="text-slate-500 text-sm">
								One student. One volume. One app.
							</p>
						</div>
						<Link href="/setup">
							<Button className="w-full" variant="outline">
								Open Setup
							</Button>
						</Link>
					</div>
				</aside>

				<div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
			</div>
		</div>
	);
}
