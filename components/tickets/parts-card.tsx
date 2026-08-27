"use client";

import * as React from "react";
import { Ban, CheckCheck, Package, Plus, Truck } from "lucide-react";
import { toast } from "sonner";

import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
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
import { PartOrderDialog, type PartProductOption } from "./part-order-dialog";

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
}: {
  ticketId: string;
  ticketStatus: string;
  parts: PartOrderRow[];
  products: PartProductOption[];
}) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

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
    toast.success("Part received — stock updated", {
      duration: 10_000,
      description: "This ticket is still parked on “Waiting for Parts”.",
      action: {
        label: "Move to In Progress",
        onClick: () => {
          startTransition(async () => {
            const result = await resumeTicketFromPartsAction(ticketId);
            if (result.error) toast.error(result.error);
            else toast.success("Ticket moved to In Progress");
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
              icon={Package}
              className="bg-status-in-progress-bg font-semibold text-status-in-progress-fg"
            >
              {outstanding} outstanding
            </Chip>
          ) : null}
        </div>
        <PartOrderDialog
          ticketId={ticketId}
          products={products}
          trigger={
            <Button variant="outline" size="sm">
              <Plus className="size-4" />
              Order Part
            </Button>
          }
        />
      </CardHeader>

      <CardContent className="px-0 py-0">
        {parts.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No parts on order for this repair.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {parts.map((part) => (
              <PartRow
                key={part.id}
                part={part}
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
            onClick={() =>
              startTransition(async () => {
                const result = await resumeTicketFromPartsAction(ticketId);
                if (result.error) toast.error(result.error);
                else toast.success("Ticket moved to In Progress");
              })
            }
          >
            Move to In Progress
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function PartRow({
  part,
  busy,
  onOrdered,
  onReceived,
  onCancel,
}: {
  part: PartOrderRow;
  busy: boolean;
  onOrdered: () => void;
  onReceived: () => void;
  onCancel: () => void;
}) {
  const status = asPartStatus(part.status);
  const meta = PART_STATUS_META[status];
  const terminal = isTerminalPartStatus(status);
  const lineCost = part.costCents != null ? part.costCents * part.quantity : null;

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {part.quantity} × {part.description}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none",
                meta.chip,
              )}
            >
              {meta.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {part.supplier ? <Chip icon={Truck}>{part.supplier}</Chip> : null}
            {part.productName ? (
              <Chip icon={Package}>{part.productName}</Chip>
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
                <CheckCheck className="size-4" />
                Mark Received
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onCancel}
                className="text-faint-foreground hover:text-destructive"
              >
                <Ban className="size-4" />
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
