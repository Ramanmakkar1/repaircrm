import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";

/**
 * What a bill or a quote is for, as rows a phone can read: the item and its
 * quantity on the left, the line's price on the right, wrapping instead of
 * scrolling sideways (the old four-column table hid the Amount column on a
 * 390px phone). The line amount is the same `quantity × unit price` the table
 * printed; nothing here computes money differently.
 */
export type LineRow = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** A serial number sold with the item. */
  serial?: string | null;
  /** "90 days", already in words. */
  warranty?: string | null;
};

export function LineRows({ lines, className }: { lines: readonly LineRow[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {lines.map((line) => (
        <li key={line.id} className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <p className="text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{line.description}</p>
            {line.quantity !== 1 ? (
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                Quantity {line.quantity} at {formatCents(line.unitPriceCents)} each
              </p>
            ) : null}
            {line.serial ? (
              <p className="mt-0.5 text-[14px] text-muted-foreground [overflow-wrap:anywhere]">Serial number {line.serial}</p>
            ) : null}
            {line.warranty ? <p className="mt-0.5 text-[14px] text-muted-foreground">Warranty: {line.warranty}</p> : null}
          </div>
          <p className="shrink-0 text-[15px] font-semibold tabular-nums">{formatCents(line.quantity * line.unitPriceCents)}</p>
        </li>
      ))}
    </ul>
  );
}

export type TotalRow = { label: string; value: string; strong?: boolean };

/** The totals under the rows: quiet lines, then the one that matters in bold. */
export function TotalsBlock({ rows, className }: { rows: readonly TotalRow[]; className?: string }) {
  return (
    <dl className={cn("flex flex-col gap-2 border-t border-border px-4 py-4 text-[15px] sm:px-6", className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn("flex items-baseline justify-between gap-4", row.strong && "border-t border-border-strong pt-2.5")}
        >
          <dt className={row.strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{row.label}</dt>
          <dd className={cn("tabular-nums", row.strong ? "text-lg font-bold" : "text-muted-foreground")}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
