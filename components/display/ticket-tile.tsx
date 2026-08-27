import { relativeShort, stalenessLevel } from "@/components/tickets/ticket-meta";
import { STALENESS_TV_COLORS } from "./display-tokens";

export type DisplayTicket = {
  id: string;
  number: number;
  subject: string;
  status: string;
  updatedAt: Date;
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

/**
 * One big tile on the wall board. Background color is the staleness heat
 * (fresh green -> warm amber -> stale orange -> critical red, per
 * `stalenessLevel`'s day thresholds); text is always white/near-white so it
 * stays readable from across the shop regardless of tile color.
 */
export function TicketTile({ ticket, now }: { ticket: DisplayTicket; now: number }) {
  const level = stalenessLevel(ticket.updatedAt, ticket.status, now);
  const palette = STALENESS_TV_COLORS[level];

  return (
    <div
      className="flex min-h-[9.5rem] flex-col justify-between rounded-2xl p-4 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]"
      style={{ background: palette.bg }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-4xl font-black leading-none tracking-tight text-white">
          {ticket.number}
        </span>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white"
          title={ticket.assignedTo?.name ?? "Unassigned"}
        >
          {initialsFor(ticket.assignedTo?.name)}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-0.5">
        <span
          className="truncate text-[15px] font-semibold text-white"
          title={ticket.subject}
        >
          {ticket.subject}
        </span>
        <span className="truncate text-sm text-white/75">
          {ticket.customer.lastName}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-2 text-xs font-semibold text-white/85">
        <span className="truncate uppercase tracking-wide">{ticket.status}</span>
        <span className="shrink-0 tabular-nums">
          {relativeShort(ticket.updatedAt, now)}
        </span>
      </div>
    </div>
  );
}
