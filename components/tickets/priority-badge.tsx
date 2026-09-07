import { cn } from "@/components/ui/cn";
import { asPriority, PRIORITY_META } from "./ticket-meta";

/**
 * Full chip — used in the ticket header. URGENT reads red, HIGH amber.
 *
 * Geometry is `StatusPill`'s md size to the pixel (6px corner, 7px dot, 12px
 * semibold), because it sits directly beside one: priority is a second state
 * on the same object, so it has to be the same shape of thing. Only the
 * palette is its own, and that comes from PRIORITY_META.
 */
export function PriorityBadge({
  priority,
  className,
}: {
  priority: string;
  className?: string;
}) {
  const meta = PRIORITY_META[asPriority(priority)];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-[3px] text-[12px] font-semibold leading-none",
        meta.chip,
        className,
      )}
    >
      <span className={cn("size-[7px] shrink-0 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/**
 * Dense variant for the list: a dot plus the label, no chip background, so a
 * table of 25 rows doesn't turn into a wall of colour. URGENT keeps the red
 * text so it still jumps out of the column.
 */
export function PriorityCell({ priority }: { priority: string }) {
  const key = asPriority(priority);
  const meta = PRIORITY_META[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[13.5px]",
        key === "URGENT"
          ? "font-bold text-status-overdue"
          : key === "HIGH"
            ? "font-semibold text-status-in-progress-fg"
            : "text-muted-foreground",
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
