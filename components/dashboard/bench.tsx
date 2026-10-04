import Link from "next/link";
import { Clock } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { STATUS_TONE, TONE_CLASS, normalizeStatus } from "@/components/ui/badge";
import { NEEDS_REPLY_FILTER } from "@/components/tickets/ticket-meta";
import type { PipelineTile } from "@/lib/dashboard/logic";
import type { ShopOverview } from "@/lib/dashboard/overview";
import { CountLink } from "./panel";
import { DeviceThumb } from "./thumbs";

/**
 * "Repairs on the bench": one big tile per status of the shop's pipeline, in the
 * shop's own order. Each tile is the count, the status in words (with the same
 * tone dot the Repairs list uses), up to three pictures of the oldest repairs
 * waiting there, and "N overdue" in words when some are late. Tapping a tile
 * opens the Repairs list on exactly that status.
 */
export function BenchSection({ bench }: { bench: ShopOverview["bench"] }) {
  return (
    <section aria-labelledby="bench-title">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="bench-title" className="text-xl font-semibold leading-tight tracking-tight">
            Repairs on the bench
          </h2>
          <p className="mt-0.5 text-[15px] text-muted-foreground" data-testid="bench-sentence">
            <span className="font-semibold text-foreground">{bench.sentence}</span>
            {bench.finish ? <> Average time to finish: {bench.finish.words} (last 30 days).</> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CountLink href="/tickets?due=today" label="Due today" count={bench.dueToday} />
          <CountLink href="/tickets?due=overdue" label="Overdue" count={bench.late} alert />
          {/* The way in to customers who wrote and were not answered: a repair can be late and waiting at once, and the Needs you rows show it once. */}
          <CountLink href={`/tickets?status=${NEEDS_REPLY_FILTER}`} label="Needs reply" count={bench.needsReply} alert />
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:[grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
        {bench.tiles.map((tile) => (
          <li key={tile.status}>
            <BenchTile tile={tile} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BenchTile({ tile }: { tile: PipelineTile }) {
  const tone = TONE_CLASS[STATUS_TONE[normalizeStatus(tile.status)]];
  const empty = tile.count === 0;
  return (
    <Link
      href={tile.href}
      className={cn(
        "group flex h-full min-h-28 flex-col justify-between gap-2 rounded-2xl border border-border bg-surface p-3",
        "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/* No aria-label: the tile's name is its own content ("4 In Progress 2 overdue"), so the printed words are the spoken words.
          The bare spaces between the parts keep that name readable and are ignored by the flex layout. */}
      <span className="flex items-start justify-between gap-2">
        <span className={cn("rf-num text-4xl font-semibold leading-none tracking-tight", empty && "text-faint-foreground")}>{tile.count}</span>{" "}
        {tile.devices.length > 0 ? (
          <span aria-hidden className="flex -space-x-2.5">
            {tile.devices.map((device, index) => (
              <DeviceThumb key={index} device={device} className="size-9 rounded-lg ring-2 ring-surface" />
            ))}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col items-start gap-1">
        <span className="flex items-center gap-2 text-sm font-semibold leading-tight">
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", tone.dot)} />
          {tile.status}
        </span>{" "}
        {tile.overdue > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-status-overdue-bg px-2 py-1 text-[13px] font-semibold leading-none text-status-overdue-fg">
            <Clock className="size-3.5" aria-hidden />
            {tile.overdue} overdue
          </span>
        ) : null}
      </span>
    </Link>
  );
}
