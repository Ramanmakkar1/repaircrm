import Link from "next/link";
import { Users } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";
import type { PopularRow, WorkloadRow } from "@/lib/dashboard/logic";
import type { ShopOverview } from "@/lib/dashboard/overview";
import { Panel } from "./panel";
import { ProductThumb } from "./thumbs";

/**
 * Team and demand: who has the work, what is selling, what people bring in.
 * Bars are plain CSS; every value is also printed beside its bar, so no figure
 * depends on the bar or its colour.
 */

const CARD_TITLE = "text-lg font-semibold";
const CARD_NOTE = "mt-0.5 text-sm text-muted-foreground";

/** A bar that is a share of the biggest one. `late` paints the late part of it on the right. */
function Bar({ value, max, late = 0, className }: { value: number; max: number; late?: number; className?: string }) {
  const width = value > 0 ? Math.max(3, (value / Math.max(1, max)) * 100) : 0;
  const lateWidth = value > 0 ? Math.min(100, (late / value) * 100) : 0;
  return (
    <span aria-hidden className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-hover">
      <span className={cn("flex h-full justify-end overflow-hidden rounded-full bg-accent", className)} style={{ width: `${width}%` }}>
        {lateWidth > 0 ? <span className="h-full bg-status-overdue" style={{ width: `${lateWidth}%` }} /> : null}
      </span>
    </span>
  );
}

export function WorkloadCard({ workload, className }: { workload: ShopOverview["workload"]; className?: string }) {
  const { rows, hidden } = workload;
  const max = Math.max(1, ...rows.map((row) => row.open));
  return (
    <Panel aria-labelledby="team-title" className={className}>
      <h2 id="team-title" className={CARD_TITLE}>
        Who is working on what
      </h2>
      <p className={CARD_NOTE}>Open repairs per person.</p>
      {rows.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-surface-hover px-3 py-4 text-[15px] font-medium text-muted-foreground">
          <Users className="size-5 shrink-0" aria-hidden />
          No open repairs, so nobody is busy.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.userId ?? "unassigned"}>
              <WorkloadRowLink row={row} max={max} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 ? (
        <Link href="/tickets" data-touch-control className="mt-2 inline-flex min-h-11 items-center text-[15px] font-semibold text-accent-soft-foreground hover:underline">
          And {hidden} more →
        </Link>
      ) : null}
    </Panel>
  );
}

function WorkloadRowLink({ row, max }: { row: WorkloadRow; max: number }) {
  return (
    <Link
      href={row.href}
      data-touch-control
      aria-label={row.words}
      className="flex min-h-12 flex-col justify-center gap-1.5 rounded-xl px-2 py-1.5 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className={cn("min-w-0 truncate text-[15px] font-semibold", row.userId === null && "italic")}>{row.name}</span>
        <span className="rf-num shrink-0 text-sm text-muted-foreground">{row.open > 0 ? `${row.open} open${row.late > 0 ? `, ${row.late} late` : ""}` : "nothing open"}</span>
      </span>
      <Bar value={row.open} max={max} late={row.late} className={row.userId === null ? "bg-faint-foreground" : undefined} />
    </Link>
  );
}

export function SellingCard({ selling, className }: { selling: NonNullable<ShopOverview["selling"]>; className?: string }) {
  const { rows, href } = selling;
  return (
    <Panel aria-labelledby="selling-title" className={className}>
      <h2 id="selling-title" className={CARD_TITLE}>
        Selling this week
      </h2>
      <p className={CARD_NOTE}>Top products by sales, last 7 days.</p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-hover px-3 py-4 text-[15px] font-medium text-muted-foreground">No products sold yet this week.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1">
          {rows.map((row, index) => {
            const body = (
              <>
                <ProductThumb name={row.name} category={row.category} catalogImage={row.catalogImage} imageUrl={row.imageUrl} className="size-12" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                  {/* The name gets the whole width (up to three lines); the count and the money share the line below. */}
                  <span className="line-clamp-3 break-words text-[15px] font-semibold">{row.name}</span>
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{row.units} sold</span>
                    <span className="rf-num text-[15px] font-semibold">{formatCents(row.cents)}</span>
                  </span>
                </span>
              </>
            );
            const style = "flex min-h-14 items-center gap-3 rounded-xl px-1.5 py-1";
            return (
              <li key={`${row.name}-${index}`}>
                {row.productId ? (
                  <Link href={`/inventory/${row.productId}`} data-touch-control className={cn(style, "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
                    {body}
                  </Link>
                ) : (
                  <div className={style}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Link href={href} data-touch-control className="mt-2 inline-flex min-h-11 items-center text-[15px] font-semibold text-accent-soft-foreground hover:underline">
        This week in Reports →
      </Link>
    </Panel>
  );
}

export function PopularCard({ popular, className }: { popular: readonly PopularRow[]; className?: string }) {
  const max = Math.max(1, ...popular.map((row) => row.count));
  return (
    <Panel aria-labelledby="popular-title" className={className}>
      <h2 id="popular-title" className={CARD_TITLE}>
        Popular repairs
      </h2>
      <p className={CARD_NOTE}>What people brought in, last 30 days.</p>
      {popular.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-hover px-3 py-4 text-[15px] font-medium text-muted-foreground">No repairs checked in over the last 30 days.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {popular.map((row) => (
            <li key={row.label} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-semibold">{row.label}</span>
                <span className="rf-num shrink-0 text-sm text-muted-foreground">{row.count} {row.count === 1 ? "repair" : "repairs"}</span>
              </span>
              <Bar value={row.count} max={max} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
