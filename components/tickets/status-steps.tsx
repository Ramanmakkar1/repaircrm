"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { useJobActions } from "./job-actions";
import { jobSteps, type StepState } from "./job-screen-logic";

/**
 * Where the repair is, as the main control of the screen.
 *
 *   [ ✓ New ] [ In Progress ] [ Waiting for Parts ] [ Waiting on Customer ] [ Ready ] [ Resolved ]
 *
 * One big pill per state of the shop's pipeline. The ones this repair has been
 * through are ticked, the ones before the current step that it skipped say
 * "Skipped" (in words, on a dashed pill), the current one is filled and marked
 * `aria-current`, the rest are plain. Tapping one opens the status sheet (an
 * optional note, an optional message to the customer, then the move), so a
 * change is never silent.
 *
 * Unlike the older tracker this is a control, not a picture of one: it lives in
 * the repair screen's Easy mode, and the tracker still draws Full mode.
 */
export function StatusSteps({
  statuses,
  visited,
}: {
  statuses: string[];
  /**
   * Every status the repair has really been in (its status-change history and
   * the status it is in now), so a skipped step is never ticked as done.
   */
  visited?: string[];
}) {
  const { status, openStatus } = useJobActions();
  const steps = jobSteps(statuses, status, visited);

  return (
    <nav aria-label="Repair status">
      <ol
        // Three across on a phone (two rows), all in one row from `sm`. The column count is the
        // number of steps, so a shop with five or eight states still fills the row evenly.
        style={{ "--steps": steps.length } as React.CSSProperties}
        className="grid grid-cols-3 gap-2 sm:[grid-template-columns:repeat(var(--steps),minmax(0,1fr))]"
      >
        {steps.map((step) => (
          <li key={step.status} className="min-w-0">
            <button
              type="button"
              aria-current={step.state === "current" ? "step" : undefined}
              // The current step is the one place nothing can be done: it is already there.
              aria-disabled={step.state === "current" ? true : undefined}
              onClick={step.state === "current" ? undefined : () => openStatus(step.status)}
              className={cn(
                "flex h-full min-h-14 w-full items-center justify-center rounded-xl border px-2 py-2 text-center text-[13.5px] font-semibold leading-tight transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                STEP_CLASS[step.state],
              )}
            >
              {/* The tick sits in the text, so a long name wraps around it instead of being squeezed beside it. */}
              <span className="text-balance">
                {step.state === "done" ? (
                  <Check aria-hidden className="mr-1 inline size-4 align-[-3px]" strokeWidth={3} />
                ) : null}
                {step.status}
                {step.state === "skipped" ? (
                  <span aria-hidden className="block text-xs font-medium">
                    Skipped
                  </span>
                ) : null}
              </span>
              <span className="sr-only">{STEP_WORDS[step.state]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** What a screen reader hears after the step's name. */
const STEP_WORDS: Record<StepState, string> = {
  done: "Done",
  skipped: "Skipped",
  current: "Current step",
  todo: "Not yet",
};

const STEP_CLASS: Record<StepState, string> = {
  done: "border-transparent bg-status-resolved-bg text-status-resolved-fg hover:brightness-95",
  skipped: "border-dashed border-border-strong bg-surface text-muted-foreground hover:border-ring hover:text-foreground",
  current: "cursor-default border-accent bg-accent text-accent-foreground",
  todo: "border-border bg-surface text-muted-foreground hover:border-ring hover:text-foreground",
};
