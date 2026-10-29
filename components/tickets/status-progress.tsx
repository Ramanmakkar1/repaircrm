import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { jobSteps } from "./job-screen-logic";
import { isResolved } from "./ticket-meta";

/**
 * Horizontal pipeline tracker across the shop's workflow states.
 *
 * Numbered circles joined by a track, the way a delivery tracker looks: steps
 * before the current one are green with a tick, the current one is a filled
 * accent circle, later ones are hollow. A Resolved ticket lights every step it
 * went through.
 *
 * The states come from `jobSteps`, the same model as the Easy view's status
 * row, so a step the repair jumped past says "Skipped" on both screens instead
 * of being ticked as done on one of them.
 *
 * Purely presentational — status is changed through the update composer, not by
 * clicking a step, so a status change always carries a note with it.
 */
export function StatusProgress({
  statuses,
  current,
  visited,
  className,
}: {
  statuses: string[];
  current: string;
  /** Every status the repair has really been in; without it every earlier step reads as done. */
  visited?: string[];
  className?: string;
}) {
  const steps = jobSteps(statuses, current, visited);
  const allDone = isResolved(current);

  return (
    /*
      On a phone six steps share ~350px, which crushed "Waiting on Customer"
      down to "Waiting on…" — a tracker whose labels you cannot read is not a
      tracker. Below `sm` each step keeps enough width for its own words and
      the row scrolls sideways instead; from `sm` up they all fit and it goes
      back to filling the width.
    */
    <ol
      className={cn(
        "flex w-full items-start overflow-x-auto pb-1 sm:overflow-x-visible sm:pb-0",
        className,
      )}
    >
      {steps.map(({ status, state }, i) => {
        const skipped = state === "skipped";
        const done = state === "done" || (allDone && state === "current");
        const active = !allDone && state === "current";
        const reached = done || active;
        const words = skipped ? "skipped" : done ? "done" : active ? "current step" : "not reached yet";

        return (
          <li
            key={status}
            aria-current={active ? "step" : undefined}
            className="flex min-w-[86px] flex-1 flex-col items-center gap-2 sm:min-w-0"
          >
            <div className="flex w-full items-center">
              <Track filled={done || skipped || (active && i > 0)} hidden={i === 0} />
              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-colors",
                  done
                    ? "border-status-resolved bg-status-resolved text-white"
                    : active
                      ? "border-accent bg-accent text-accent-foreground shadow-sm"
                      : skipped
                        ? "border-dashed border-border-strong bg-surface text-muted-foreground"
                        : "border-border-strong bg-surface text-faint-foreground",
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              <Track filled={done || skipped} hidden={i === steps.length - 1} />
            </div>
            <span
              className={cn(
                "line-clamp-2 px-1 text-center text-[12.5px] leading-tight",
                active
                  ? "font-bold text-foreground"
                  : reached
                    ? "font-semibold text-status-resolved-fg"
                    : "text-faint-foreground",
              )}
              title={status}
            >
              {status}
              {skipped ? <span aria-hidden className="block text-[11.5px] font-medium text-muted-foreground">Skipped</span> : null}
              <span className="sr-only">, {words}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Track({ filled, hidden }: { filled: boolean; hidden: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 flex-1 rounded-full transition-colors",
        hidden
          ? "bg-transparent"
          : filled
            ? "bg-status-resolved"
            : "bg-border-strong/50",
      )}
    />
  );
}
