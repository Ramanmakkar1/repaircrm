import { Package } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { IconVisual, MetaChip, RecordCard } from "@/components/ui/record-card";
import { formatCents } from "@/lib/money";
import { poDateLabel, receivedLabel } from "./easy-lists";
import { PO_STATUS_META, asPoStatus, poTotals } from "./purchasing";

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
 * One purchase order in the Easy-mode list: a box, "Order #1002", the supplier
 * underneath with the delivery date (and what has arrived) as small facts, and on
 * the right its status in words over what it costs. The whole card opens the order.
 */
export function PurchaseOrderCard({ order }: { order: PurchaseOrderCardData }) {
  const status = asPoStatus(order.status);
  const meta = PO_STATUS_META[status];
  const totals = poTotals(order.lines, order.shippingCents);
  const received = receivedLabel(status, totals.receivedQty, totals.orderedQty);
  return (
    <li className="flex">
      <RecordCard
        className="min-w-0 flex-1"
        href={`/inventory/purchase-orders/${order.id}`}
        visual={<IconVisual icon={Package} />}
        title={<span className="block whitespace-normal break-words">Order #{order.number}</span>}
        subtitle={order.vendor.name}
        meta={
          <>
            <MetaChip>
              <span className="whitespace-nowrap">{poDateLabel({ status, expectedAt: order.expectedAt, receivedAt: order.receivedAt })}</span>
            </MetaChip>
            {received ? (
              <MetaChip>
                <span className="whitespace-nowrap">{received}</span>
              </MetaChip>
            ) : null}
          </>
        }
        trailing={
          // Status over the total, both on the right: on a phone a pill in the title row
          // would squeeze "Order #1002" down to "Order ...".
          <span className="flex h-full flex-col items-end justify-center gap-2">
            <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />
            <span className="rf-num text-xl font-semibold tabular-nums">{formatCents(totals.totalCents)}</span>
          </span>
        }
      />
    </li>
  );
}
