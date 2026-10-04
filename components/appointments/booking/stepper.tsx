"use client";

import { Check } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { STEPS } from "./flow";

/**
 * 1 Who, 2 When, 3 What for. Never locked: any step can be tapped at any time.
 * The current one is filled in AND carries aria-current; a finished one shows a
 * tick, so how far the booking has got reads off this one row.
 */
export function Stepper({
  step,
  done,
  onStep,
}: {
  step: number;
  done: boolean[];
  onStep: (next: number) => void;
}) {
  return (
    <nav aria-label="Booking steps">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((item, index) => {
          const current = index === step;
          const finished = done[index] && !current;
          return (
            <li key={item.label} className="min-w-0">
              <button
                type="button"
                onClick={() => onStep(index)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border px-1.5 text-center transition-colors sm:gap-2 sm:px-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-foreground hover:border-ring",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold sm:size-7 sm:text-sm",
                    current
                      ? "bg-accent-foreground text-accent"
                      : finished
                        ? "bg-accent-soft text-accent-soft-foreground"
                        : "bg-surface-hover text-muted-foreground",
                  )}
                >
                  {finished ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className="truncate text-[15px] font-semibold leading-tight">
                  {item.label}
                  {finished ? <span className="sr-only"> (done)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
