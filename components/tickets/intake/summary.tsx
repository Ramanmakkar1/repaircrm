"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { LAST_STEP, type SummaryRow } from "./flow";

/**
 * "This repair": what has been chosen so far, one row each with a Change that
 * jumps back to that step, and the one big button. When the button cannot be
 * pressed yet it says why in plain words, and pressing it anyway takes you to
 * the step that is missing something.
 */
export function SummaryPanel({
  rows,
  onChange,
  reason,
  pending,
  showActions = true,
  className,
}: {
  rows: SummaryRow[];
  onChange: (step: number) => void;
  /** Why checking in is not possible yet, or null when it is. */
  reason: string | null;
  pending: boolean;
  /** Off where the phone's bar carries the button instead. */
  showActions?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4", className)}>
      <h2 className="text-lg font-semibold">This repair</h2>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex min-h-12 items-center gap-3 py-1">
            <dt className="w-20 shrink-0 text-sm text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug">
              {row.value || <span className="font-normal text-muted-foreground">{row.empty}</span>}
            </dd>
            <Button
              type="button"
              variant="ghost"
              className="h-12 shrink-0 px-3 text-[15px]"
              aria-label={`Change ${row.label.toLowerCase()}`}
              onClick={() => onChange(row.step)}
            >
              Change
            </Button>
          </div>
        ))}
      </dl>
      {showActions ? <div className="flex flex-col gap-2">
        {reason ? (
          <p id="ci-reason" role="status" className="text-[15px] font-medium text-muted-foreground">{reason}</p>
        ) : null}
        <Button
          type="submit"
          disabled={pending}
          aria-disabled={reason ? true : undefined}
          aria-describedby={reason ? "ci-reason" : undefined}
          className={cn("h-14 w-full text-base", reason && "opacity-60")}
        >
          {pending ? "Checking in…" : "Check in repair"}
        </Button>
        <Button asChild variant="ghost" className="h-12 text-[15px]">
          <Link href="/counter">Cancel</Link>
        </Button>
      </div> : null}
    </div>
  );
}

/**
 * The phone's version of the summary: one line of what is chosen and the one
 * button, pinned to the bottom of the screen above the tab bar. "Next" on the
 * way through, "Check in repair" on the last step.
 */
export function MobileBar({
  step,
  line,
  reason,
  warning = null,
  pending,
  onNext,
}: {
  step: number;
  line: string;
  reason: string | null;
  /** What Next / Check in was refused for on this step: the bar is always on screen, so it says so too. */
  warning?: string | null;
  pending: boolean;
  onNext: () => void;
}) {
  const last = step === LAST_STEP;
  const message = warning ?? (last ? reason : null);
  return (
    <div
      role="region"
      aria-label="This repair"
      // Fixed just above the phone's tab bar (4rem tall; there is none from sm up, where the
      // assistant button sits at the right, hence the extra padding there). <main> keeps 7rem
      // of bottom padding, so the last of the page is never hidden behind it.
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-border-strong bg-surface py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:bottom-0 sm:pb-[max(.75rem,env(safe-area-inset-bottom))] sm:pr-24 lg:hidden print:hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold text-muted-foreground">Step {step + 1} of {LAST_STEP + 1}</span>
        <span className={cn("text-[15px] font-semibold", message ? "line-clamp-2 leading-snug text-destructive" : "truncate")}>{message ?? line}</span>
      </div>
      {last ? (
        <Button
          type="submit"
          disabled={pending}
          aria-disabled={reason ? true : undefined}
          className={cn("h-14 shrink-0 px-5 text-base", reason && "opacity-60")}
        >
          {pending ? "Checking in…" : "Check in repair"}
        </Button>
      ) : (
        <Button type="button" onClick={onNext} className="h-14 shrink-0 px-8 text-base">Next</Button>
      )}
    </div>
  );
}
