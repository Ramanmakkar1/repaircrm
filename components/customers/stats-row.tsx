import * as React from "react";
import {
  Banknote,
  CircleDollarSign,
  Receipt,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { IconChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";

/**
 * The five numbers a front-desk tech wants before they pick up the phone:
 * how much work is on the bench, how much has been billed, what the customer
 * has ever paid, what they still owe, and what credit they're holding.
 *
 * Each one is its own chunky box with an icon tile, so the row scans as five
 * objects rather than a strip of small print.
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <Stat
        icon={Wrench}
        label="Tickets"
        value={String(ticketCount)}
        hint={openTicketCount > 0 ? `${openTicketCount} open` : "none open"}
        emphasis={openTicketCount > 0 ? "active" : "none"}
      />
      <Stat icon={Receipt} label="Invoices" value={String(invoiceCount)} />
      <Stat
        icon={Banknote}
        label="Lifetime revenue"
        value={formatCents(lifetimeRevenueCents)}
      />
      <Stat
        icon={CircleDollarSign}
        label="Unpaid balance"
        value={formatCents(unpaidBalanceCents)}
        emphasis={unpaidBalanceCents > 0 ? "owing" : "none"}
      />
      <Stat
        icon={Wallet}
        label="Store credit"
        value={formatCents(creditBalanceCents)}
        emphasis={creditBalanceCents > 0 ? "credit" : "none"}
      />
    </div>
  );
}

/** Icon-tile tint per emphasis — the box stays neutral, the tile carries colour. */
const TILE: Record<Emphasis, string> = {
  none: "bg-surface-hover text-muted-foreground",
  active: "bg-status-in-progress-bg text-status-in-progress-fg",
  owing: "bg-status-overdue-bg text-status-overdue-fg",
  credit: "bg-status-resolved-bg text-status-resolved-fg",
};

type Emphasis = "none" | "owing" | "credit" | "active";

function Stat({
  icon,
  label,
  value,
  hint,
  emphasis = "none",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  emphasis?: Emphasis;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <IconChip icon={icon} size="sm" className={TILE[emphasis]} />

      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "text-2xl font-bold leading-none tabular-nums tracking-tight",
            emphasis === "owing" && "text-destructive",
            emphasis === "credit" && "text-status-resolved-fg",
            emphasis === "none" && "text-foreground",
            emphasis === "active" && "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
        {hint ? (
          <span
            className={cn(
              "text-[13px]",
              emphasis === "active"
                ? "font-semibold text-status-in-progress-fg"
                : "text-faint-foreground",
            )}
          >
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}
