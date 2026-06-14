import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { AppNavigation } from "~/app/navigation";

export const metadata: Metadata = {
	title: "Moodle Study Sync",
	description: "Self-hosted Moodle to Google Drive sync utility",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={`${geist.variable}`} lang="en">
			<body>
				<AppNavigation>{children}</AppNavigation>
			</body>
		</html>
	);
}
