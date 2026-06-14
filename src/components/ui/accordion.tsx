import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "~/lib/utils";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
	return (
		<AccordionPrimitive.Root
			className={cn("flex w-full flex-col", className)}
			data-slot="accordion"
			{...props}
		/>
	);
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
	return (
		<AccordionPrimitive.Item
			className={cn("not-last:border-b", className)}
			data-slot="accordion-item"
			{...props}
		/>
	);
}

function AccordionTrigger({
	className,
	children,
	headerClassName,
	hideIcon = false,
	...props
}: AccordionPrimitive.Trigger.Props & {
	headerClassName?: string;
	hideIcon?: boolean;
}) {
	return (
		<AccordionPrimitive.Header className={cn("flex", headerClassName)}>
			<AccordionPrimitive.Trigger
				className={cn(
					"group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left font-medium text-sm outline-none transition-all hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
					className,
				)}
				data-slot="accordion-trigger"
				{...props}
			>
				{children}
				{hideIcon ? null : (
					<>
						<ChevronDownIcon
							className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
							data-slot="accordion-trigger-icon"
						/>
						<ChevronUpIcon
							className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
							data-slot="accordion-trigger-icon"
						/>
					</>
				)}
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	);
}

function AccordionContent({
	className,
	children,
	...props
}: AccordionPrimitive.Panel.Props) {
	return (
		<AccordionPrimitive.Panel
			className="data-closed:animation-duration-200 data-open:animation-duration-300 overflow-hidden text-sm data-closed:animate-accordion-up data-open:animate-accordion-down data-closed:ease-[cubic-bezier(0.32,0,0.67,0)] data-open:ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none"
			data-slot="accordion-content"
			{...props}
		>
			<div
				className={cn(
					"h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
					className,
				)}
			>
				{children}
			</div>
		</AccordionPrimitive.Panel>
	);
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
