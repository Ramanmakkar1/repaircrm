"use client";

import { ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { LAST_STEP, type Copy } from "./flow";

/**
 * The phone's version of the panel: one line of what is on the bill and the one
 * button, pinned to the bottom of the screen above the tab bar. Tapping the line
 * opens "Your items" (the panel as a sheet) to change quantities. "Next" on the
 * way through, "Save invoice" on the last step.
 */
export function BillMobileBar({
  step,
  line,
  reason,
  warning = null,
  pending,
  copy,
  onNext,
  onOpenItems,
}: {
  step: number;
  line: string;
  reason: string | null;
  /** What Next / Save was refused for on this step: the bar is always on screen, so it says so too. */
  warning?: string | null;
  pending: boolean;
  copy: Copy;
  onNext: () => void;
  /** Opens the items sheet; omit while there is nothing to show. */
  onOpenItems?: () => void;
}) {
  const last = step === LAST_STEP;
  const message = warning ?? (last ? reason : null);
  const text = (
    <>
      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        Step {step + 1} of {LAST_STEP + 1}
        {onOpenItems && !message ? <><span aria-hidden>·</span> Tap to see items <ChevronUp aria-hidden className="size-3.5" /></> : null}
      </span>
      <span className={cn("text-[15px] font-semibold", message ? "line-clamp-2 leading-snug text-destructive" : "truncate")}>{message ?? line}</span>
    </>
  );
  return (
    <div
      role="region"
      aria-label={copy.panel}
      // Fixed just above the phone's tab bar (4rem tall; there is none from sm up, where the
      // assistant button sits at the right, hence the extra padding there). <main> keeps 7rem
      // of bottom padding, so the last of the page is never hidden behind it.
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-border-strong bg-surface py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:bottom-0 sm:pb-[max(.75rem,env(safe-area-inset-bottom))] sm:pr-24 lg:hidden print:hidden"
    >
      {onOpenItems ? (
        <button
          type="button"
          onClick={onOpenItems}
          aria-label={`Show what is on this ${copy.noun}`}
          className="-my-1 flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">{text}</div>
      )}
      {last ? (
        <Button
          type="submit"
          disabled={pending}
          aria-disabled={reason ? true : undefined}
          className={cn("h-14 shrink-0 px-5 text-base", reason && "opacity-60")}
        >
          {pending ? copy.saving : copy.save}
        </Button>
      ) : (
        <Button type="button" onClick={onNext} className="h-14 shrink-0 px-8 text-base">Next</Button>
      )}
    </div>
  );
}
