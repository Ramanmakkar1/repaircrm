import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays, Package, Wrench } from "lucide-react";

import { STATUS_META, StatusBadge, normalizeStatus } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { initials } from "@/components/customers/format";
import {
  asPriority,
  customerLabel,
  PRIORITY_META,
  RESOLVED_STATUS,
  relativeShort,
  STALENESS_CARD,
  STALENESS_CLASS,
  STALENESS_LABEL,
  stalenessLevel,
} from "./ticket-meta";
import { partsChipLabel } from "./part-meta";

/**
 * One repair job as a single tappable box.
 *
 * Two colours carry meaning and nothing else does:
 *   · the thick bar down the left edge = the ticket's STATUS (one of the six
 *     canonical status tokens), readable from across the room;
 *   · the card's border and wash = STALENESS, i.e. how long it has sat
 *     untouched — the same thresholds the old table's heat column used.
 *
 * Everything below the subject is a quiet grey chip, so those two signals are
 * never competing with the details.
 *
 * A plain server-rendered <Link> wraps the whole card: no client JS, and
 * middle-click / open-in-new-tab / copy-link all behave.
 */
export type TicketCardData = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  problemType?: string | null;
  dueDate?: Date | null;
  updatedAt: Date;
  customer: { firstName: string; lastName: string; businessName?: string | null };
  assignedTo?: { name: string } | null;
  asset?: { type: string; make?: string | null; model?: string | null } | null;
  /**
   * Only the NON-TERMINAL part orders — the ones the ticket is still waiting
   * on. Optional so callers that do not care about parts (the dashboard's
   * recent-tickets strip, the landing-page mockup) need not query for them.
   */
  partOrders?: { status: string }[];
  /**
   * The customer wrote in and nobody has answered yet — see lib/needs-reply.ts
   * for the rule. Optional so callers that do not compute it (the dashboard's
   * recent strip, the landing-page mockup) need not.
   */
  needsReply?: boolean;
};

export function TicketCard({
  ticket,
  now,
  className,
}: {
  ticket: TicketCardData;
  /** One request-time clock, so every card in a render agrees on "now". */
  now: number;
  className?: string;
}) {
  const level = stalenessLevel(ticket.updatedAt, ticket.status, now);
  const statusMeta = STATUS_META[normalizeStatus(ticket.status)];
  const priority = asPriority(ticket.priority);
  const loud = priority === "HIGH" || priority === "URGENT";
  const overdue =
    ticket.dueDate != null &&
    ticket.dueDate.getTime() < now &&
    ticket.status !== RESOLVED_STATUS;

  const device =
    ticket.asset && (ticket.asset.make || ticket.asset.model)
      ? [ticket.asset.make, ticket.asset.model].filter(Boolean).join(" ")
      : (ticket.asset?.type ?? null);

  const tech = ticket.assignedTo?.name ?? null;
  const partsLabel = partsChipLabel(ticket.partOrders);

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className={cn(
        "rf-lift group relative flex flex-col gap-3 overflow-hidden rounded-lg border bg-surface p-5 pl-6 shadow-sm",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        STALENESS_CARD[level],
        className,
      )}
    >
      {/* status colour bar */}
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1.5", statusMeta.dot)}
      />

      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="text-2xl font-bold leading-none tabular-nums tracking-tight text-foreground">
            #{ticket.number}
          </span>
          {/* One small blue dot: a customer message is waiting. Deliberately
              not another chip in the row below — this has to be visible in the
              half-second someone spends scanning the board. */}
          {ticket.needsReply ? (
            <span
              title="Customer replied — no answer yet"
              className="size-2.5 shrink-0 rounded-full bg-accent"
            >
              <span className="sr-only">Needs reply</span>
            </span>
          ) : null}
        </span>
        <StatusBadge status={ticket.status} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="truncate text-[15px] font-bold text-foreground">
          {customerLabel(ticket.customer)}
        </span>
        <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">
          {ticket.subject}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {device ? <Chip icon={Wrench}>{device}</Chip> : null}
        {ticket.problemType ? <Chip>{ticket.problemType}</Chip> : null}

        {/* Waiting on a part is the single most common reason a job stalls, so
            it earns a tinted chip rather than another grey one. */}
        {partsLabel ? (
          <Chip
            icon={Package}
            className="bg-status-waiting-bg font-semibold text-status-waiting-fg"
          >
            {partsLabel}
          </Chip>
        ) : null}

        {loud ? (
          <Chip className={cn("font-bold", PRIORITY_META[priority].chip)}>
            {PRIORITY_META[priority].label}
          </Chip>
        ) : null}

        {ticket.dueDate ? (
          <Chip
            icon={CalendarDays}
            className={cn(
              overdue && "bg-status-overdue-bg font-bold text-status-overdue-fg",
            )}
            title={ticket.dueDate.toLocaleString()}
          >
            {overdue ? "Overdue " : "Due "}
            {format(ticket.dueDate, "MMM d")}
          </Chip>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        {tech ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-soft-foreground">
              {initials(tech)}
            </span>
            <span className="truncate text-[13px] font-medium text-muted-foreground">
              {tech}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-[11px] font-bold text-faint-foreground">
              ?
            </span>
            <span className="text-[13px] font-medium text-faint-foreground">
              Unassigned
            </span>
          </span>
        )}

        <span
          title={STALENESS_LABEL[level]}
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold tabular-nums",
            STALENESS_CLASS[level],
          )}
        >
          {relativeShort(ticket.updatedAt, now)}
        </span>
      </div>
    </Link>
  );
}
