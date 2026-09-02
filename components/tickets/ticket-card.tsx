import Link from "next/link";
import { format } from "date-fns";
// BellRing and HandCoins have no concept in components/ui/icons.ts.
// The device chip uses `ICONS.device`, deliberately NOT the wrench: on this
// card the wrench already means "ticket", so reusing it for the machine on the
// bench would say two things at once.
import { BellRing, HandCoins } from "lucide-react";

import { DUE_TONE_CLASS, dueChip } from "@/lib/sla";
import { progressLabel, type ChecklistProgress } from "@/lib/checklist";

import {
  STATUS_TONE,
  StatusBadge,
  TONE_CLASS,
  normalizeStatus,
} from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ICONS } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { initials } from "@/components/customers/format";
import { formatCents } from "@/lib/money";
import {
  asPriority,
  customerLabel,
  isReadyForPickup,
  PRIORITY_META,
  RESOLVED_STATUS,
  relativeShort,
  STALENESS_CLASS,
  STALENESS_LABEL,
  stalenessLevel,
} from "./ticket-meta";
import { partsChipLabel } from "./part-meta";

/**
 * One repair job as a single tappable box.
 *
 * One colour carries meaning: the shared `Card tone` stripe down the left edge
 * is the ticket's STATUS, in the same seven-tone language every other card in
 * the app speaks. Staleness — how long the job has sat untouched — used to
 * wash the whole card as well; it now says so in words in the footer chip,
 * because two colour axes on one box meant neither of them read.
 *
 * Everything below the subject is a quiet grey chip, so the stripe and the
 * status pill are never competing with the details.
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
   * Checklist progress, when the ticket carries one. Computed by the page so
   * the card never has to parse the Json blob itself.
   */
  checklist?: ChecklistProgress | null;
  /**
   * Money taken up front, in cents. Optional so callers that do not query for
   * it (the landing-page mockup) need not.
   */
  depositCents?: number | null;
  /**
   * The customer wrote in and nobody has answered yet — see lib/needs-reply.ts
   * for the rule. Optional so callers that do not compute it (the dashboard's
   * recent strip, the landing-page mockup) need not.
   */
  needsReply?: boolean;
  /**
   * When the device actually left. Optional so the callers that don't care
   * (the dashboard strip, the landing-page mockup) need not select it.
   */
  pickedUpAt?: Date | null;
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
  const priority = asPriority(ticket.priority);
  const loud = priority === "HIGH" || priority === "URGENT";
  const due = dueChip(ticket.dueDate, ticket.status === RESOLVED_STATUS, now);
  const checklist =
    ticket.checklist && ticket.checklist.total > 0 ? ticket.checklist : null;

  const device =
    ticket.asset && (ticket.asset.make || ticket.asset.model)
      ? [ticket.asset.make, ticket.asset.model].filter(Boolean).join(" ")
      : (ticket.asset?.type ?? null);

  const tech = ticket.assignedTo?.name ?? null;
  const partsLabel = partsChipLabel(ticket.partOrders);
  // Fixed, on the shelf, and still nobody has come for it — the one state a
  // front counter can actually do something about with a phone call.
  const awaitingPickup =
    isReadyForPickup(ticket.status) && !ticket.pickedUpAt;

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className={cn(
        "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Card
        interactive
        tone={STATUS_TONE[normalizeStatus(ticket.status)]}
        className="flex h-full flex-col gap-3 p-5"
      >
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
          <span
            className="truncate text-[15px] font-bold text-foreground"
            title={customerLabel(ticket.customer)}
          >
            {customerLabel(ticket.customer)}
          </span>
          <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {ticket.subject}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {device ? <Chip icon={ICONS.device}>{device}</Chip> : null}
          {ticket.problemType ? <Chip>{ticket.problemType}</Chip> : null}

          {/* Waiting on a part is the single most common reason a job stalls, so
              it earns a tinted chip rather than another grey one. */}
          {partsLabel ? (
            <Chip
              icon={ICONS.part}
              className={cn(TONE_CLASS.waiting.chip, "font-semibold")}
            >
              {partsLabel}
            </Chip>
          ) : null}

          {awaitingPickup ? (
            <Chip
              icon={BellRing}
              className={cn(TONE_CLASS.success.chip, "font-semibold")}
            >
              Awaiting pickup
            </Chip>
          ) : null}

          {/* Money already collected changes what the counter says when this
              customer walks in, so it rides on the card rather than only on the
              ticket page. */}
          {ticket.depositCents && ticket.depositCents > 0 ? (
            <Chip
              icon={HandCoins}
              className={cn(TONE_CLASS.success.chip, "font-semibold")}
            >
              Deposit {formatCents(ticket.depositCents)}
            </Chip>
          ) : null}

          {loud ? (
            <Chip className={cn("font-bold", PRIORITY_META[priority].chip)}>
              {PRIORITY_META[priority].label}
            </Chip>
          ) : null}

          {checklist ? (
            <Chip
              icon={ICONS.checklist}
              className={cn(
                checklist.done === checklist.total && [
                  TONE_CLASS.success.chip,
                  "font-semibold",
                ],
              )}
              title="Checklist progress"
            >
              {progressLabel(checklist)}
            </Chip>
          ) : null}

          {/* Red once it is late, amber inside the last day, quiet before that —
              see lib/sla.ts. */}
          {ticket.dueDate && due ? (
            <Chip
              icon={ICONS.dueDate}
              className={cn(DUE_TONE_CLASS[due.tone])}
              title={`Due ${format(ticket.dueDate, "EEEE d MMMM yyyy")}`}
            >
              {due.tone === "later"
                ? `Due ${format(ticket.dueDate, "MMM d")}`
                : due.label}
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
      </Card>
    </Link>
  );
}
