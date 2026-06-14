import { headers } from "next/headers";

import { AppShell } from "~/app/app-shell";

export async function AppNavigation({
	children,
}: {
	children: React.ReactNode;
}) {
	const headerStore = await headers();
	const currentPath = headerStore.get("x-pathname") ?? "/";

	return <AppShell currentPath={currentPath}>{children}</AppShell>;
}
