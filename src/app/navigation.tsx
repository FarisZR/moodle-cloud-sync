import { AppShell } from "~/app/app-shell";

export async function AppNavigation({
	children,
}: {
	children: React.ReactNode;
}) {
	return <AppShell>{children}</AppShell>;
}
