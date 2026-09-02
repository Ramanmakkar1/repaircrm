"use client";

import * as React from "react";
// Truck is "on its way from the supplier", which is not one of the shared
// verbs; everything else on this card comes from ACTIONS / ICONS.
import { Loader2, Truck } from "lucide-react";
import { toast } from "sonner";

import { formatCents } from "@/lib/money";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import {
  cancelPartOrderAction,
  markPartOrderedAction,
  markPartReceivedAction,
  resumeTicketFromPartsAction,
} from "@/app/(app)/tickets/actions";
import {
  asPartStatus,
  isTerminalPartStatus,
  PART_STATUS_META,
  type PartActionState,
} from "./part-meta";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addPartOrderToPoAction } from "@/app/(app)/inventory/purchase-orders/actions";
import {
  PartOrderDialog,
  type PartProductOption,
  type PartVendorOption,
} from "./part-order-dialog";

/**
 * One part order, flattened for the client.
 *
 * Dates arrive pre-formatted plus an `overdue` flag computed on the server
 * against the request-time clock — a `new Date()` in here would disagree with
 * the server render and warn on hydration.
 */
export type PartOrderRow = {
  id: string;
  description: string;
  supplier: string | null;
  quantity: number;
  costCents: number | null;
  status: string;
  expectedLabel: string | null;
  expectedOverdue: boolean;
  stampLabel: string | null;
  notes: string | null;
  productName: string | null;
  /** The vendor this part is destined for, if one was chosen. */
  vendorId: string | null;
  /** Set once the part has been rolled onto a purchase order. */
  poNumber: number | null;
  poId: string | null;
};

/**
 * Parts sourcing on the ticket — RepairShopr's "Part Order / Parts Status".
 *
 * This is the procurement list, NOT the bill: what the bench is waiting on, who
 * it was ordered from and when it should land. What the customer pays for lives
 * in Charges. A part can be received without ever being charged (warranty), and
 * charged without ever being ordered (it was already on the shelf).
 *
 * Receiving a part that is linked to a catalogue product adds it back to stock
 * through the audited path (see markPartReceivedAction), so this card is a real
 * inventory surface, not just a checklist.
 */
export function PartsCard({
  ticketId,
  ticketStatus,
  parts,
  products,
  vendors,
  canPurchase,
}: {
  ticketId: string;
  ticketStatus: string;
  parts: PartOrderRow[];
  products: PartProductOption[];
  vendors: PartVendorOption[];
  /** Purchase orders are owner-only, so the button is hidden for everyone else. */
  canPurchase: boolean;
}) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  // `resuming` is read: the footer button must not be pressable twice while
  // the status change is in flight.
  const [resuming, startTransition] = React.useTransition();

  const outstanding = parts.filter(
    (part) => !isTerminalPartStatus(part.status),
  ).length;

  /**
   * The "Move ticket to In Progress?" prompt.
   *
   * It rides on the receive toast as an action button rather than a second
   * dialog: the tech is holding a part, and the answer is one tap either way.
   * Declining is simply not tapping it — nothing is forced, which is the point.
   */
  const offerResume = () => {
    toast.success("Part received — stock updated.", {
      duration: 10_000,
      description: "This ticket is still parked on “Waiting for Parts”.",
      action: {
        label: "Move to In Progress",
        onClick: () => {
          startTransition(async () => {
            const result = await resumeTicketFromPartsAction(ticketId);
            if (result.error) toast.error(result.error);
            else toast.success("Ticket moved to In Progress.");
          });
        },
      },
    });
  };

  const run = (
    partId: string,
    action: (id: string) => Promise<PartActionState>,
    successMessage: string,
  ) => {
    setPendingId(partId);
    startTransition(async () => {
      const result = await action(partId);
      setPendingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.offerResume) offerResume();
      else toast.success(successMessage);
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <CardTitle>Parts</CardTitle>
          {outstanding > 0 ? (
            <Chip
              icon={ICONS.part}
              className="bg-status-in-progress-bg font-semibold text-status-in-progress-fg"
            >
              {outstanding} outstanding
            </Chip>
          ) : null}
        </div>
        <PartOrderDialog
          ticketId={ticketId}
          products={products}
          vendors={vendors}
          trigger={
            <Button variant="outline" size="sm">
              <ACTIONS.add className="size-4" />
              Order Part
            </Button>
          }
        />
      </CardHeader>

      <CardContent className="px-0 py-0">
        {parts.length === 0 ? (
          <EmptyState
            className="px-5 py-10"
            icon={ICONS.part}
            title="No parts on order"
            hint="Order one and the ticket shows what it is waiting for, on the board and here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {parts.map((part) => (
              <PartRow
                key={part.id}
                part={part}
                vendors={vendors}
                canPurchase={canPurchase}
                busy={pendingId === part.id}
                onOrdered={() =>
                  run(part.id, markPartOrderedAction, "Marked as ordered")
                }
                onReceived={() =>
                  run(
                    part.id,
                    markPartReceivedAction,
                    "Part received — stock updated",
                  )
                }
                onCancel={() =>
                  run(part.id, cancelPartOrderAction, "Part order canceled")
                }
              />
            ))}
          </ul>
        )}
      </CardContent>

      {ticketStatus === "Waiting for Parts" && outstanding === 0 && parts.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-[13.5px] text-muted-foreground">
            Everything on this list has landed, but the ticket is still waiting.
          </p>
          <Button
            variant="soft"
            size="sm"
            disabled={resuming}
            onClick={() =>
              startTransition(async () => {
                const result = await resumeTicketFromPartsAction(ticketId);
                if (result.error) toast.error(result.error);
                else toast.success("Ticket moved to In Progress.");
              })
            }
          >
            {resuming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {resuming ? "Moving…" : "Move to In Progress"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function PartRow({
  part,
  vendors,
  canPurchase,
  busy,
  onOrdered,
  onReceived,
  onCancel,
}: {
  part: PartOrderRow;
  vendors: PartVendorOption[];
  canPurchase: boolean;
  busy: boolean;
  onOrdered: () => void;
  onReceived: () => void;
  onCancel: () => void;
}) {
  const status = asPartStatus(part.status);
  const meta = PART_STATUS_META[status];
  const terminal = isTerminalPartStatus(status);
  const lineCost = part.costCents != null ? part.costCents * part.quantity : null;
  const [attaching, startAttach] = React.useTransition();

  /**
   * Roll this part onto a vendor's open draft PO (creating one if there isn't
   * one). From then on the purchase order owns the stock movement — receiving
   * the PO line is what marks this part received.
   */
  const attach = (vendorId: string) =>
    startAttach(async () => {
      const result = await addPartOrderToPoAction(part.id, vendorId);
      if (result.error) toast.error(result.error);
      else toast.success(`Added to PO #${result.number}.`);
    });

  const canAttach =
    canPurchase && !terminal && part.poNumber === null && vendors.length > 0;

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {part.quantity} × {part.description}
            </span>
            <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {part.supplier ? <Chip icon={ICONS.vendor}>{part.supplier}</Chip> : null}
            {part.productName ? (
              <Chip icon={ICONS.part}>{part.productName}</Chip>
            ) : null}
            {part.expectedLabel ? (
              <Chip
                className={cn(
                  part.expectedOverdue &&
                    "bg-status-overdue-bg font-bold text-status-overdue-fg",
                )}
              >
                {part.expectedOverdue ? "Expected " : "Due "}
                {part.expectedLabel}
                {part.expectedOverdue ? " · overdue" : ""}
              </Chip>
            ) : null}
            {part.stampLabel ? <Chip>{part.stampLabel}</Chip> : null}
            {part.poNumber !== null && part.poId ? (
              <a
                href={`/inventory/purchase-orders/${part.poId}`}
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold leading-none text-accent-soft-foreground transition-colors hover:brightness-95"
              >
                <ICONS.purchaseOrder className="size-3.5" />
                PO #{part.poNumber}
              </a>
            ) : null}
          </div>

          {part.notes ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
              {part.notes}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {lineCost != null ? (
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatCents(lineCost)}
            </span>
          ) : null}

          {!terminal ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {canAttach ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={attaching}>
                      <ICONS.purchaseOrder className="size-4" />
                      Add to PO
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Order from</DropdownMenuLabel>
                    {orderVendors(vendors, part.vendorId).map((vendor) => (
                      <DropdownMenuItem
                        key={vendor.id}
                        onSelect={() => attach(vendor.id)}
                      >
                        {vendor.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {status === "NEEDED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={onOrdered}
                >
                  <Truck className="size-4" />
                  Mark Ordered
                </Button>
              ) : null}
              <Button variant="soft" size="sm" disabled={busy} onClick={onReceived}>
                <ACTIONS.receive className="size-4" />
                Mark Received
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onCancel}
                className="text-faint-foreground hover:text-destructive"
              >
                <ACTIONS.void className="size-4" />
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** The part's own vendor first — it is the answer nine times out of ten. */
function orderVendors(
  vendors: PartVendorOption[],
  preferredId: string | null,
): PartVendorOption[] {
  if (!preferredId) return vendors;
  const preferred = vendors.find((vendor) => vendor.id === preferredId);
  if (!preferred) return vendors;
  return [preferred, ...vendors.filter((vendor) => vendor.id !== preferredId)];
}
