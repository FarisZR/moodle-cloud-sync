"use client";

import { Check, Copy, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

function parseExtensions(value: string) {
	const unique = new Set<string>();

	for (const item of value.split(",")) {
		const normalized = item.trim().replace(/^\./, "").toLowerCase();

		if (normalized) {
			unique.add(normalized);
		}
	}

	return [...unique];
}

type ExtensionEditorProps = {
	className?: string;
	defaultValue: string;
	name: string;
};

export function ExtensionEditor({
	className,
	defaultValue,
	name,
}: ExtensionEditorProps) {
	const [extensions, setExtensions] = useState(() =>
		parseExtensions(defaultValue),
	);
	const [draft, setDraft] = useState("");

	function addExtension() {
		const [next] = parseExtensions(draft);

		if (!next) {
			return;
		}

		setExtensions((current) =>
			current.includes(next) ? current : [...current, next],
		);
		setDraft("");
	}

	return (
		<div className={cn("space-y-2", className)}>
			<input name={name} type="hidden" value={extensions.join(",")} />
			<div className="flex flex-wrap items-center gap-2">
				{extensions.map((extension) => (
					<button
						className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm transition hover:border-slate-300 hover:bg-white"
						key={extension}
						onClick={() =>
							setExtensions((current) =>
								current.filter((item) => item !== extension),
							)
						}
						type="button"
					>
						{extension}
						<X className="size-3.5 text-muted-foreground" />
					</button>
				))}
				<label className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white pr-1 pl-3 text-sm transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
					<span className="text-slate-700">+</span>
					<Input
						aria-label="New extension"
						className="h-6 w-16 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								addExtension();
							}
						}}
						placeholder="Add"
						value={draft}
					/>
					<Button
						aria-label="Add extension"
						className="size-6 rounded-full"
						disabled={draft.trim() === ""}
						onClick={addExtension}
						size="icon-xs"
						type="button"
						variant="ghost"
					>
						<Plus className="size-3.5" />
					</Button>
				</label>
			</div>
		</div>
	);
}

export function CopyButton({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const [copied, setCopied] = useState(false);

	return (
		<Button
			aria-label={copied ? "Copied" : "Copy to clipboard"}
			className={cn("size-8 shrink-0", className)}
			disabled={!text}
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1400);
			}}
			size="icon"
			type="button"
			variant="outline"
		>
			{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
		</Button>
	);
}
