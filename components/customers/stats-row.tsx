import * as React from "react";
// CircleDollarSign is the one glyph here with no concept in components/ui/icons.ts.
import { CircleDollarSign } from "lucide-react";

import type { StatusTone } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/card";
import { ICONS } from "@/components/ui/icons";
import { formatCents } from "@/lib/money";

/**
 * The five numbers a front-desk tech wants before they pick up the phone:
 * how much work is on the bench, how much has been billed, what the customer
 * has ever paid, what they still owe, and what credit they're holding.
 *
 * All five are `StatTile`, the shared metric tile — same slots, same digits,
 * same tinted icon square as the dashboard's row. The tone is the only colour
 * on a tile and it is never decorative: amber means work is open, red means
 * money is owed, green means credit is sitting on the account.
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
  const owing: StatusTone = unpaidBalanceCents > 0 ? "danger" : "neutral";
  const credit: StatusTone = creditBalanceCents > 0 ? "success" : "neutral";

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile
        icon={ICONS.ticket}
        tone={openTicketCount > 0 ? "active" : "neutral"}
        label="Tickets"
        value={String(ticketCount)}
        hint={openTicketCount > 0 ? `${openTicketCount} open` : "none open"}
      />
      <StatTile
        icon={ICONS.invoice}
        label="Invoices"
        value={String(invoiceCount)}
      />
      <StatTile
        icon={ICONS.cash}
        label="Lifetime revenue"
        value={formatCents(lifetimeRevenueCents)}
      />
      <StatTile
        icon={CircleDollarSign}
        tone={owing}
        label="Unpaid balance"
        value={formatCents(unpaidBalanceCents)}
        hint={unpaidBalanceCents > 0 ? "owed to the shop" : "nothing outstanding"}
      />
      <StatTile
        icon={ICONS.credit}
        tone={credit}
        label="Store credit"
        value={formatCents(creditBalanceCents)}
        hint={creditBalanceCents > 0 ? "spendable at checkout" : "none held"}
      />
    </div>
  );
}
