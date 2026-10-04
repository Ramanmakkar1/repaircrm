import Link from "next/link";
import { PackageCheck } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InitialsVisual, MetaChip, RecordCard } from "@/components/ui/record-card";
import { isLate } from "@/lib/inventory/dates";
import { formatCents } from "@/lib/money";
import { poDateLabel, receivedLabel } from "./easy-lists";
import { PO_STATUS_META, asPoStatus, poTotals } from "./purchasing";
import { FOOTER_ACTION, RecordWithActions } from "./record-with-actions";

export type PurchaseOrderCardData = {
  id: string;
  number: number;
  status: string;
  shippingCents: number;
  createdAt: Date;
  orderedAt: Date | null;
  expectedAt: Date | null;
  receivedAt?: Date | null;
  vendor: { id: string; name: string };
  lines: { quantity: number; unitCostCents: number; receivedQty: number }[];
};

/**
 * One purchase order in the Easy-mode list: the supplier's initials (so ten
 * orders are not ten identical boxes), "Order #1002", the supplier underneath,
 * the delivery date and what has arrived as small facts, and its status in
 * words over what it costs. A delivery that is past its day says "Late" in
 * words. An order that is out with the supplier carries a "Book in delivery"
 * button under it, which opens the order with the booking-in sheet already up.
 *
 * `todayKey` and `zone` are the shop's calendar day and time zone
 * (lib/inventory/dates.ts); without them nothing is ever called late.
 */
export function PurchaseOrderCard({
  order,
  todayKey,
  zone,
}: {
  order: PurchaseOrderCardData;
  todayKey?: string;
  zone?: string;
}) {
  const status = asPoStatus(order.status);
  const meta = PO_STATUS_META[status];
  const totals = poTotals(order.lines, order.shippingCents);
  const received = receivedLabel(status, totals.receivedQty, totals.orderedQty);
  const late = todayKey ? isLate({ status, expectedAt: order.expectedAt }, todayKey) : false;
  const canBookIn = (status === "ORDERED" || status === "PARTIAL") && totals.receivedQty < totals.orderedQty;
  const href = `/inventory/purchase-orders/${order.id}`;

  const card = {
    href,
    visual: <InitialsVisual name={order.vendor.name} />,
    title: <span className="block whitespace-normal break-words">Order #{order.number}</span>,
    subtitle: order.vendor.name,
    meta: (
      <>
        {late ? (
          <MetaChip tone="alert">
            <span className="whitespace-nowrap font-semibold">Late</span>
          </MetaChip>
        ) : null}
        <MetaChip>
          <span className="whitespace-nowrap">{poDateLabel({ status, expectedAt: order.expectedAt, receivedAt: order.receivedAt }, zone)}</span>
        </MetaChip>
        {received ? (
          <MetaChip>
            <span className="whitespace-nowrap">{received}</span>
          </MetaChip>
        ) : null}
      </>
    ),
    trailing: (
      // Status over the total, both on the right: on a phone a pill in the title row
      // would squeeze "Order #1002" down to "Order ...".
      <span className="flex h-full flex-col items-end justify-center gap-2">
        <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />
        <span className="rf-num text-xl font-semibold tabular-nums">{formatCents(totals.totalCents)}</span>
      </span>
    ),
  };

  if (canBookIn) {
    return (
      <RecordWithActions
        {...card}
        actions={
          <Button variant="ghost" asChild className={`${FOOTER_ACTION} gap-2 text-base font-semibold text-foreground [&_svg]:size-5`}>
            <Link href={`${href}?receive=1`} aria-label={`Book in the delivery for order #${order.number}`}>
              <PackageCheck aria-hidden />
              Book in delivery
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <li className="flex">
      <RecordCard className="min-w-0 flex-1" {...card} />
    </li>
  );
}
