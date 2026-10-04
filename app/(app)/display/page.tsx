import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EyeOff, Eye } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { requestNow } from "@/lib/now";
import { pipelineStatuses, safeTimeZone } from "@/lib/dashboard/logic";
import { dayKeyIn, dayWindow } from "@/lib/dashboard/zone";
import { RESOLVED_STATUS, ticketStatuses } from "@/components/tickets/ticket-meta";
import { STATUS_TONE, normalizeStatus } from "@/components/ui/badge";
import { StatusChip } from "@/components/display/status-chip";
import { TicketTile } from "@/components/display/ticket-tile";
import { LiveClock } from "@/components/display/live-clock";
import { AutoRefresh } from "@/components/display/auto-refresh";
import { FullscreenToggle } from "@/components/display/fullscreen-toggle";

// The tab title is what a shop names the browser window it leaves running on
// the wall TV, so it says what the screen is rather than inheriting the shell.
export const metadata: Metadata = { title: "Shop floor board · Repairs helper" };

// This board is meant to be read live off a shop-floor TV, so every request
// (including each 30s auto-refresh) must hit the DB fresh — never serve a
// cached RSC payload.
export const dynamic = "force-dynamic";

const BOARD_ID = "shop-board";

/**
 * The shop-floor board: every open repair as a big tile, readable from across
 * the room, refreshing itself every 30 seconds.
 *
 * It always draws in the app's DARK theme (`data-theme="dark"` on the board, so
 * the theme tokens switch for it alone): a lit white slab on a wall TV is hard
 * on the eyes, and it looks the same whatever the TV's own setting.
 *
 * One header row (how many are open, the shop's clock, Hide names, Full
 * screen), then each status as a count in words, then the tiles. "Full screen"
 * fills the TV with the board alone. It is a STAFF board: it shows surnames and
 * repair notes, so "Hide names" leaves those off for a screen customers see.
 */
export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;
  const hideNames = params.private === "1";
  const nowMs = requestNow();

  // The board hangs on ONE shop floor, so it shows that branch's work when a
  // branch is selected in the top bar.
  const [branch, shop] = await Promise.all([
    locationWhere(),
    db.shop.findUnique({ where: { id: shopId }, select: { timezone: true, settings: true } }),
  ]);
  const zone = safeTimeZone(shop?.timezone);
  // "Finished today" is the shop's day, cut at its own midnight.
  const today = dayWindow(dayKeyIn(nowMs, zone), zone);

  const [tickets, resolvedTodayCount] = await Promise.all([
    db.ticket.findMany({
      where: {
        shopId,
        ...branch,
        status: { not: RESOLVED_STATUS, mode: "insensitive" },
      },
      // Oldest `updatedAt` first == most stale first — the whole point of
      // the board is surfacing what's been sitting the longest.
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        updatedAt: true,
        dueDate: true,
        customer: { select: { lastName: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    db.ticket.count({
      where: {
        shopId,
        ...branch,
        resolvedAt: { gte: new Date(today.from), lt: new Date(today.toExclusive) },
      },
    }),
  ]);

  const statusCounts = new Map<string, number>();
  let overdueCount = 0;
  for (const ticket of tickets) {
    statusCounts.set(ticket.status, (statusCounts.get(ticket.status) ?? 0) + 1);
    // "Overdue" on the wall now means what it means everywhere else: past the
    // date the customer was given, not merely untouched for three days.
    if (ticket.dueDate !== null && ticket.dueDate.getTime() < nowMs) {
      overdueCount += 1;
    }
  }
  // The shop's own statuses, in its own order, plus any a repair carries that the list does not name:
  // the counts always add up to every open repair.
  const statuses = pipelineStatuses(ticketStatuses(shop?.settings), [...statusCounts.keys()]);

  return (
    <div
      id={BOARD_ID}
      data-theme="dark"
      className="flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4 overflow-y-auto rounded-2xl bg-background p-4 text-foreground sm:p-6 [&:fullscreen]:min-h-dvh [&:fullscreen]:rounded-none"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-muted-foreground">Open repairs</span>
          <span className="rf-num text-5xl font-black tracking-tight">{tickets.length}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col items-end">
            <LiveClock timeZone={zone} className="text-4xl font-bold leading-none" />
            <AutoRefresh timeZone={zone} className="text-sm text-muted-foreground" />
          </div>
          <Link
            href={hideNames ? "/display" : "/display?private=1"}
            data-touch-control
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {hideNames ? <Eye className="size-5" aria-hidden /> : <EyeOff className="size-5" aria-hidden />}
            {hideNames ? "Show names" : "Hide names"}
          </Link>
          <FullscreenToggle targetId={BOARD_ID} />
        </div>
      </header>

      <ul aria-label="Repairs by status" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {statuses.map((status) => (
          <li key={status}>
            <StatusChip label={status} count={statusCounts.get(status) ?? 0} tone={STATUS_TONE[normalizeStatus(status)]} />
          </li>
        ))}
        <li>
          <StatusChip label="Overdue" count={overdueCount} tone="danger" />
        </li>
        <li>
          <StatusChip label="Finished today" count={resolvedTodayCount} tone="success" />
        </li>
      </ul>

      {tickets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span className="relative block size-28 overflow-hidden rounded-2xl bg-white">
            <Image src="/images/home/toolbox.webp" alt="" fill sizes="112px" className="object-contain p-2" />
          </span>
          <span className="text-3xl font-bold">All caught up</span>
          <span className="text-lg text-muted-foreground">No open repairs right now.</span>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tickets.map((ticket) => (
            <TicketTile key={ticket.id} ticket={ticket} now={nowMs} hideNames={hideNames} />
          ))}
        </div>
      )}
    </div>
  );
}
