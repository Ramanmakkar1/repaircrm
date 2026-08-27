import { startOfDay, endOfDay } from "date-fns";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DEFAULT_TICKET_STATUSES,
  RESOLVED_STATUS,
  stalenessLevel,
} from "@/components/tickets/ticket-meta";
import { normalizeStatus } from "@/components/ui/badge";
import { STATUS_TV_COLORS } from "@/components/display/display-tokens";
import { StatusChip } from "@/components/display/status-chip";
import { TicketTile } from "@/components/display/ticket-tile";
import { LiveClock } from "@/components/display/live-clock";
import { AutoRefresh } from "@/components/display/auto-refresh";
import { FullscreenToggle } from "@/components/display/fullscreen-toggle";

// This board is meant to be read live off a shop-floor TV, so every request
// (including each 30s auto-refresh) must hit the DB fresh — never serve a
// cached RSC payload.
export const dynamic = "force-dynamic";

/** The 6-status workflow, minus the terminal "Resolved" state — these are
 * the columns that can actually be "open" on the board. */
const OPEN_STATUSES = DEFAULT_TICKET_STATUSES.filter(
  (status) => status !== RESOLVED_STATUS,
);

export default async function DisplayPage() {
  const { shopId } = await requireUser();
  const now = new Date();
  const nowMs = now.getTime();

  const [tickets, resolvedTodayCount] = await Promise.all([
    db.ticket.findMany({
      where: {
        shopId,
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
        customer: { select: { lastName: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    db.ticket.count({
      where: {
        shopId,
        resolvedAt: { gte: startOfDay(now), lte: endOfDay(now) },
      },
    }),
  ]);

  const statusCounts = new Map<string, number>();
  let overdueCount = 0;
  for (const ticket of tickets) {
    statusCounts.set(ticket.status, (statusCounts.get(ticket.status) ?? 0) + 1);
    if (stalenessLevel(ticket.updatedAt, ticket.status, nowMs) === "critical") {
      overdueCount += 1;
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col gap-5 rounded-2xl bg-[#0a0a0b] p-5 text-white sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <span className="text-5xl font-black tracking-tight tabular-nums">
          Open {tickets.length}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {OPEN_STATUSES.map((status) => {
            const palette = STATUS_TV_COLORS[normalizeStatus(status)];
            return (
              <StatusChip
                key={status}
                label={status}
                count={statusCounts.get(status) ?? 0}
                bg={palette.bg}
                fg={palette.fg}
              />
            );
          })}
          <StatusChip
            label="Overdue"
            count={overdueCount}
            bg={STATUS_TV_COLORS.overdue.bg}
            fg={STATUS_TV_COLORS.overdue.fg}
          />
          <StatusChip
            label="Resolved today"
            count={resolvedTodayCount}
            bg={STATUS_TV_COLORS.resolved.bg}
            fg={STATUS_TV_COLORS.resolved.fg}
          />
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <LiveClock className="text-3xl font-bold" />
          <div className="flex items-center gap-2 text-xs text-white/50">
            <AutoRefresh />
            <FullscreenToggle className="flex size-6 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </header>

      {tickets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <span className="text-6xl">🎉</span>
          <span className="text-3xl font-bold">All caught up</span>
          <span className="text-white/60">No open tickets right now.</span>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tickets.map((ticket) => (
            <TicketTile key={ticket.id} ticket={ticket} now={nowMs} />
          ))}
        </div>
      )}
    </div>
  );
}
