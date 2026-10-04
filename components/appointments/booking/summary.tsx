"use client";

import { cn } from "@/components/ui/cn";
import type { SummaryPart } from "./flow";

/**
 * Who - When - What: what the booking is so far, live, in three boxes that sit
 * just above the big button. Each one is a tap that jumps back to its step.
 */
export function SummaryStrip({
  parts,
  onStep,
  className,
}: {
  parts: SummaryPart[];
  onStep: (step: number) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="This visit" className={cn("grid grid-cols-[1fr_1.4fr_1fr] gap-2", className)}>
      {parts.map((part) => (
        <button
          key={part.label}
          type="button"
          onClick={() => onStep(part.step)}
          aria-label={`${part.label}: ${part.value ? [part.value, part.detail].filter(Boolean).join(", ") : part.empty}. Change`}
          className="flex min-h-14 min-w-0 flex-col items-start justify-center gap-0.5 rounded-xl bg-surface-hover px-2.5 py-1.5 sm:px-3 text-left transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-xs font-semibold text-muted-foreground">{part.label}</span>
          {/* Two lines on a phone (the day, then the time); one line from a tablet up, where there is room. */}
          <span className="flex w-full min-w-0 flex-col sm:flex-row sm:flex-wrap sm:gap-x-1.5">
            <span
              className={cn(
                "line-clamp-2 break-words text-sm font-semibold leading-tight sm:text-[15px]",
                part.detail && "sm:after:content-[',']",
              )}
            >
              {part.value || <span className="font-normal text-muted-foreground">{part.empty}</span>}
            </span>
            {part.detail ? (
              <span className="truncate text-[13px] leading-tight text-muted-foreground sm:text-[15px] sm:font-semibold sm:text-foreground">
                {part.detail}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
