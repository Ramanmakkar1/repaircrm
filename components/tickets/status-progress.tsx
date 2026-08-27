import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { isResolved } from "./ticket-meta";

/**
 * Horizontal pipeline tracker across the shop's workflow states.
 *
 * Numbered circles joined by a track, the way a delivery tracker looks: steps
 * before the current one are green with a tick, the current one is a filled
 * accent circle, later ones are hollow. A Resolved ticket lights every step.
 *
 * Purely presentational — status is changed through the update composer, not by
 * clicking a step, so a status change always carries a note with it.
 */
export function StatusProgress({
  statuses,
  current,
  className,
}: {
  statuses: string[];
  current: string;
  className?: string;
}) {
  // An off-pipeline status (a shop renamed a state after tickets were written)
  // must not silently light up every step, so treat "not found" as step 0.
  const index = statuses.findIndex(
    (s) => s.toLowerCase() === current.trim().toLowerCase(),
  );
  const allDone = isResolved(current);

  return (
    <ol className={cn("flex w-full items-start", className)}>
      {statuses.map((status, i) => {
        const done = allDone || (index >= 0 && i < index);
        const active = !allDone && i === index;
        const reached = done || active;

        return (
          <li
            key={status}
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            <div className="flex w-full items-center">
              <Track filled={done || (active && i > 0)} hidden={i === 0} />
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-colors",
                  done
                    ? "border-status-resolved bg-status-resolved text-white"
                    : active
                      ? "border-accent bg-accent text-accent-foreground shadow-sm"
                      : "border-border-strong bg-surface text-faint-foreground",
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              <Track filled={done} hidden={i === statuses.length - 1} />
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
