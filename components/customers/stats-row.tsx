import * as React from "react";

import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";

/**
 * The five numbers a front-desk tech wants before they pick up the phone:
 * how much work is on the bench, how much has been billed, what the customer
 * has ever paid, what they still owe, and what credit they're holding.
 */
export function StatsRow({
  ticketCount,
  openTicketCount,
  invoiceCount,
  lifetimeRevenueCents,
  unpaidBalanceCents,
  creditBalanceCents,
}: {
  ticketCount: number;
  openTicketCount: number;
  invoiceCount: number;
  lifetimeRevenueCents: number;
  unpaidBalanceCents: number;
  creditBalanceCents: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Stat
        label="Tickets"
        value={String(ticketCount)}
        hint={openTicketCount > 0 ? `${openTicketCount} open` : "none open"}
        emphasis={openTicketCount > 0 ? "active" : "none"}
      />
      <Stat label="Invoices" value={String(invoiceCount)} />
      <Stat label="Lifetime revenue" value={formatCents(lifetimeRevenueCents)} />
      <Stat
        label="Unpaid balance"
        value={formatCents(unpaidBalanceCents)}
        emphasis={unpaidBalanceCents > 0 ? "owing" : "none"}
      />
      <Stat
        label="Store credit"
        value={formatCents(creditBalanceCents)}
        emphasis={creditBalanceCents > 0 ? "credit" : "none"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis = "none",
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: "none" | "owing" | "credit" | "active";
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-xs">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-base font-semibold tabular-nums tracking-tight",
          emphasis === "owing" && "text-destructive",
          emphasis === "credit" && "text-status-resolved-fg",
          emphasis === "none" && "text-foreground",
          emphasis === "active" && "text-foreground",
        )}
      >
        {value}
      </span>
      {hint ? (
        <span
          className={cn(
            "text-xs",
            emphasis === "active" ? "text-status-in-progress-fg" : "text-faint-foreground",
          )}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
