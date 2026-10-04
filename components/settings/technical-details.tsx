import * as React from "react";
import { ChevronDown, Wrench } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * Where the developer detail goes: environment variable names, web addresses
 * to register, event names, curl. Closed by default and addressed to whoever
 * installed Repairs helper, so a shop owner reading Settings sees what a
 * thing does, whether it is on and the one next step, and never has to read
 * past a variable name to get there.
 *
 * A plain <details>: it opens without JavaScript, works with a keyboard and a
 * screen reader announces it as expandable. No "use client", so server pages
 * (Assistant setup) can use it too.
 */
export function TechnicalDetails({
  title = "Technical details",
  hint = "For your installer, or whoever set up Repairs helper for you.",
  children,
  className,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details data-technical-details="" className={cn("group rounded-2xl border border-border bg-surface", className)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted-foreground">
          <Wrench className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold leading-tight text-foreground">{title}</span>
          <span className="text-[13px] leading-snug text-muted-foreground">{hint}</span>
        </span>
        <span className="text-[14px] font-semibold text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-[14px] font-semibold text-muted-foreground group-open:inline">Hide</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex flex-col gap-5 border-t border-border p-4 sm:p-5">{children}</div>
    </details>
  );
}
