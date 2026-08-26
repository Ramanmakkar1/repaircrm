import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { isResolved } from "./ticket-meta";

/**
 * Horizontal pipeline tracker across the shop's workflow states.
 *
 * Steps before the current one read as done (green + check), the current one is
 * highlighted, later ones are muted. A Resolved ticket lights the whole bar.
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
    <ol className={cn("flex w-full items-start gap-1", className)}>
      {statuses.map((status, i) => {
        const done = allDone || (index >= 0 && i < index);
        const active = !allDone && i === index;
        return (
          <li key={status} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors",
                done
                  ? "bg-status-resolved"
                  : active
                    ? "bg-accent"
                    : "bg-border-strong/60",
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1 truncate text-[11px] leading-tight",
                done
                  ? "text-status-resolved-fg"
                  : active
                    ? "font-semibold text-foreground"
                    : "text-faint-foreground",
              )}
              title={status}
            >
              {done ? <Check className="size-3 shrink-0" strokeWidth={3} /> : null}
              <span className="truncate">{status}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
