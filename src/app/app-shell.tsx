"use client";

import { BookOpen, FolderSync, House, Logs, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "~/lib/utils";

type AppShellProps = {
	children: React.ReactNode;
};

const navigation = [
	{ href: "/", icon: House, label: "Dashboard" },
	{ href: "/setup", icon: Settings, label: "Setup" },
	{ href: "/courses", icon: BookOpen, label: "Courses" },
	{ href: "/logs", icon: Logs, label: "Logs" },
];

function isActivePath(currentPath: string, href: string) {
	if (href === "/") {
		return currentPath === "/" || currentPath === "/dashboard";
	}

	return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function AppShell({ children }: AppShellProps) {
	const currentPath = usePathname() || "/";

	return (
		<div className="min-h-screen bg-[linear-gradient(180deg,oklch(0.985_0.006_251)_0%,oklch(0.952_0.014_251)_100%)] text-foreground">
			<div className="grid min-h-screen lg:grid-cols-[200px_1fr]">
				<aside className="border-slate-200 border-b bg-sidebar px-4 py-4 lg:border-r lg:border-b-0">
					<div className="flex items-center gap-2 px-1">
						<div className="flex size-8 items-center justify-center text-primary">
							<FolderSync className="size-6 fill-primary/10" />
						</div>
						<p className="font-semibold text-[13px] text-sidebar-foreground">
							Moodle Study Sync
						</p>
					</div>

					<nav className="mt-7 grid gap-1">
						{navigation.map((item) => {
							const isActive = isActivePath(currentPath, item.href);

							return (
								<Link
									className={cn(
										"flex h-9 items-center gap-3 rounded-md px-3 font-medium text-[13px] transition",
										isActive
											? "bg-blue-50 text-primary shadow-sm"
											: "text-sidebar-foreground/75 hover:bg-slate-50 hover:text-sidebar-foreground",
									)}
									href={item.href}
									key={item.href}
								>
									<item.icon className="size-4" strokeWidth={1.9} />
									{item.label}
								</Link>
							);
						})}
					</nav>

					<div className="mt-24 hidden lg:block">
						<div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
							<div className="mx-auto mb-2 flex w-fit items-center gap-2 text-[12px] text-slate-700">
								<span className="size-2 rounded-full bg-emerald-500" />
								Self-hosted
							</div>
							<p className="text-muted-foreground text-xs">v1.0.0</p>
						</div>
					</div>
				</aside>

				<main className="min-w-0 bg-[linear-gradient(180deg,oklch(0.995_0.003_251),oklch(0.982_0.006_251))] px-5 py-5 md:px-7">
					{children}
				</main>
			</div>
		</div>
	);
}
