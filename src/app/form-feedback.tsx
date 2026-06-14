"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

type PendingButtonProps = Omit<
	React.ComponentProps<typeof Button>,
	"children" | "type"
> & {
	children: React.ReactNode;
	pendingLabel?: string;
};

export function PendingButton({
	children,
	className,
	pendingLabel = "Working...",
	variant = "default",
	...props
}: PendingButtonProps) {
	const { pending } = useFormStatus();

	return (
		<Button
			aria-busy={pending}
			className={cn(
				"relative min-w-28 overflow-hidden",
				pending && "text-primary-foreground/85",
				className,
			)}
			disabled={pending}
			type="submit"
			variant={variant}
			{...props}
		>
			<span
				className={cn("inline-flex items-center gap-2", pending && "opacity-0")}
			>
				{children}
			</span>
			<span
				className={cn(
					"absolute inset-0 inline-flex translate-y-1 items-center justify-center gap-2 opacity-0 transition",
					pending && "translate-y-0 opacity-100",
				)}
			>
				<LoaderCircle className="size-3.5 animate-spin" />
				{pendingLabel}
			</span>
		</Button>
	);
}

type SecretInputProps = React.ComponentProps<typeof Input> & {
	revealedLabel?: string;
};

export function SecretInput({
	className,
	revealedLabel,
	...props
}: SecretInputProps) {
	const [revealed, setRevealed] = useState(false);
	const generatedId = useId();
	const buttonLabel = revealed
		? `Hide ${revealedLabel ?? "secret"}`
		: `Show ${revealedLabel ?? "secret"}`;

	return (
		<div className="relative">
			<Input
				{...props}
				className={cn("pr-10", className)}
				type={revealed ? "text" : "password"}
			/>
			<button
				aria-label={buttonLabel}
				className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				id={`${props.id ?? generatedId}-toggle`}
				onClick={() => setRevealed((value) => !value)}
				type="button"
			>
				{revealed ? (
					<EyeOff className="size-3.5" />
				) : (
					<Eye className="size-3.5" />
				)}
			</button>
		</div>
	);
}

type AutoSubmitCheckboxProps = React.ComponentProps<"input"> & {
	mode?: "checkbox" | "switch";
};

export function AutoSubmitCheckbox({
	className,
	mode = "checkbox",
	onChange,
	...props
}: AutoSubmitCheckboxProps) {
	const { pending } = useFormStatus();

	return (
		<input
			{...props}
			className={cn(
				mode === "switch"
					? "h-5 w-9 cursor-pointer appearance-none rounded-full border border-slate-300 bg-slate-200 transition before:block before:size-4 before:translate-x-0 before:rounded-full before:bg-white before:shadow-sm before:transition checked:border-emerald-500 checked:bg-emerald-500 checked:before:translate-x-4 disabled:cursor-not-allowed disabled:opacity-60"
					: "size-4 cursor-pointer rounded border-slate-300 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-60",
				pending && "opacity-60",
				className,
			)}
			disabled={pending || props.disabled}
			onChange={(event) => {
				onChange?.(event);
				event.currentTarget.form?.requestSubmit();
			}}
			type="checkbox"
		/>
	);
}
