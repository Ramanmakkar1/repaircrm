"use client";

import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { STEPS } from "./flow";

export type StepState = { done: boolean; text: string };

/**
 * 1 Customer, 2 Device, 3 Problem, 4 Details. Never locked: any step can be
 * tapped at any time. The current one is filled in AND carries aria-current;
 * a finished one shows a tick and the choice made, so the whole repair can be
 * read off this one row.
 */
export function Stepper({
  step,
  statuses,
  onStep,
}: {
  step: number;
  statuses: StepState[];
  onStep: (next: number) => void;
}) {
  return (
    <nav aria-label="Check-in steps">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((item, index) => {
          const current = index === step;
          const status = statuses[index];
          return (
            <li key={item.label} className="min-w-0">
              <button
                type="button"
                onClick={() => onStep(index)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-full min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-foreground hover:border-ring",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    current
                      ? "bg-accent-foreground text-accent"
                      : status.done
                        ? "bg-accent-soft text-accent-soft-foreground"
                        : "bg-surface-hover text-muted-foreground",
                  )}
                >
                  {status.done && !current ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className="flex min-w-0 max-w-full flex-col">
                  <span className="truncate text-[13px] font-semibold leading-tight sm:text-[15px]">
                    {item.label}
                    {status.done && !current ? <span className="sr-only"> (done)</span> : null}
                  </span>
                  {status.text ? (
                    <span className={cn("hidden truncate text-[13px] leading-tight sm:block", current ? "text-accent-foreground/80" : "text-muted-foreground")}>
                      {status.text}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
