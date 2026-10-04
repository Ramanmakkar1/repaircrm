import { AlertTriangle } from "lucide-react";

import { STATUS_TONE, TONE_CLASS, normalizeStatus } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { stalenessLevel } from "@/components/tickets/ticket-meta";
import { spanWords } from "@/lib/dashboard/logic";

export type DisplayTicket = {
  id: string;
  number: number;
  subject: string;
  status: string;
  updatedAt: Date;
  /** Null when nobody promised a date. */
  dueDate?: Date | null;
  customer: { lastName: string };
  assignedTo: { name: string } | null;
};

/** Initials for the assigned-tech badge — "Jane Doe" -> "JD", solo name -> first 2 letters. */
function initialsFor(name: string | null | undefined): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

/** "Updated 3 days ago": how long it has sat, in words (the same rounding as the Repairs list). */
export function ageWords(updatedAt: Date, now: number): string {
  const ms = now - updatedAt.getTime();
  return ms < 60_000 ? "Updated just now" : `Updated ${spanWords(ms)} ago`;
}

/**
 * One big tile on the wall board, readable from across the shop.
 *
 * The repair number is the headline; the status is its own line in WORDS
 * (never cut short, it wraps instead); "Overdue" is a word with a warning sign
 * when the promised date has passed; how long it has sat is said in words, in
 * bold once it is more than two days. Colour only backs those words up: the
 * tile itself is plain, so a tile never means two things by colour.
 *
 * `hideNames` leaves the customer's surname and the repair notes off, for a
 * screen customers can see.
 */
export function TicketTile({
  ticket,
  now,
  hideNames = false,
}: {
  ticket: DisplayTicket;
  now: number;
  hideNames?: boolean;
}) {
  const tone = TONE_CLASS[STATUS_TONE[normalizeStatus(ticket.status)]];
  const overdue = ticket.dueDate != null && ticket.dueDate.getTime() < now;
  const level = stalenessLevel(ticket.updatedAt, ticket.status, now);
  const sitting = level === "stale" || level === "critical";

  return (
    <div
      className={cn(
        "flex min-h-[10rem] flex-col justify-between gap-2 rounded-2xl border bg-surface p-4",
        overdue ? "border-status-overdue ring-2 ring-inset ring-status-overdue" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rf-num text-4xl font-black leading-none tracking-tight">{ticket.number}</span>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-sm font-bold"
          title={ticket.assignedTo?.name ?? "Not assigned"}
        >
          {initialsFor(ticket.assignedTo?.name)}
          <span className="sr-only">{ticket.assignedTo ? ` (${ticket.assignedTo.name})` : " (not assigned)"}</span>
        </span>
      </div>

      {hideNames ? null : (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-base font-semibold leading-snug" title={ticket.subject}>
            {ticket.subject}
          </span>
          <span className="truncate text-[15px] text-muted-foreground">{ticket.customer.lastName}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-border pt-2">
        <span className={cn("inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-[15px] font-semibold leading-tight", tone.chip)}>
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", tone.dot)} />
          {ticket.status}
        </span>
        {overdue ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-status-overdue-bg px-2 py-1 text-[15px] font-bold leading-tight text-status-overdue-fg">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Overdue
          </span>
        ) : null}
        <span className={cn("text-sm", sitting ? "font-bold text-foreground" : "text-muted-foreground")}>
          {ageWords(ticket.updatedAt, now)}
        </span>
      </div>
    </div>
  );
}
