"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2, Truck } from "lucide-react";
import { toast } from "sonner";

import {
  cancelPurchaseOrderAction,
  emailPurchaseOrderAction,
  markPurchaseOrderedAction,
  type PoActionState,
} from "@/app/(app)/inventory/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { ReceivePoDialog, type ReceivableLine } from "./receive-po-dialog";
import { CANCELABLE_PO_STATUSES, RECEIVABLE_PO_STATUSES, asPoStatus } from "./purchasing";

const EMPTY: PoActionState = {};

/**
 * Everything you can do to a purchase order, in the order you do it: place it,
 * send it to the vendor, book it in, or call it off.
 *
 * Buttons that would fail are simply not rendered — a disabled control that
 * explains itself in a toast after the click is worse than one that was never
 * there, and the server enforces the same rules regardless.
 */
export function PurchaseOrderActions({
  purchaseOrderId,
  status,
  lines,
  vendorEmail,
  expectedAt,
  size,
}: {
  purchaseOrderId: string;
  status: string;
  lines: ReceivableLine[];
  /** Null hides "Email to vendor" — there is nowhere to send it. */
  vendorEmail: string | null;
  /** yyyy-mm-dd, to seed the "mark ordered" date field. */
  expectedAt: string;
  /**
   * Height of the buttons this renders into a page header's action row.
   *
   * Defaults to undefined, i.e. the Button default — every existing call site
   * keeps exactly what it had. The PO detail page passes "sm" so these line up
   * with the Print button beside them and with the invoice and estimate action
   * rows two screens over; a header row of mixed-height buttons is the kind of
   * thing nobody can name but everybody sees.
   */
  size?: "sm";
}) {
  const current = asPoStatus(status);
  const [busy, startTransition] = React.useTransition();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  const canReceive =
    RECEIVABLE_PO_STATUSES.includes(current) &&
    lines.some((line) => line.quantity > line.receivedQty);
  const canCancel = CANCELABLE_PO_STATUSES.includes(current);

  const email = () =>
    startTransition(async () => {
      const result = await emailPurchaseOrderAction(purchaseOrderId);
      if (result.error) toast.error(result.error);
      else toast.success(`Purchase order sent to ${vendorEmail}.`);
    });

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelPurchaseOrderAction(purchaseOrderId);
      setConfirmingCancel(false);
      if (result.error) toast.error(result.error);
      else toast.success("Purchase order canceled.");
    });

  return (
    <>
      {current === "DRAFT" ? (
        <MarkOrderedDialog
          purchaseOrderId={purchaseOrderId}
          expectedAt={expectedAt}
          size={size}
        />
      ) : null}

      {vendorEmail ? (
        <Button variant="outline" size={size} disabled={busy} onClick={email}>
          {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.email />}
          Email to Vendor
        </Button>
      ) : null}

      {canReceive ? (
        <ReceivePoDialog
          purchaseOrderId={purchaseOrderId}
          lines={lines}
          trigger={
            <Button size={size}>
              <ACTIONS.receive />
              Receive
            </Button>
          }
        />
      ) : null}

      {/* Calling off an order is not undoable from the UI, so it asks first —
          and the confirm button wears the destructive colour, not the
          quiet ghost the trigger does. */}
      {canCancel ? (
        <Dialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size={size}
              disabled={busy}
              className="text-faint-foreground hover:text-destructive"
            >
              <ACTIONS.void />
              Cancel order
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this purchase order?</DialogTitle>
              <DialogDescription>
                It stays on file as a canceled order — nothing is deleted and no
                stock moves — but it can&rsquo;t be received or reopened
                afterwards.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmingCancel(false)}
              >
                Keep it
              </Button>
              <Button variant="destructive" disabled={busy} onClick={cancel}>
                {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.void />}
                {busy ? "Canceling…" : "Cancel order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/**
 * DRAFT → ORDERED, with the date the vendor promised.
 *
 * The date is asked for here rather than at creation because it is only real
 * once the order has actually been placed — before that it is a guess.
 */
function MarkOrderedDialog({
  purchaseOrderId,
  expectedAt,
  size,
}: {
  purchaseOrderId: string;
  expectedAt: string;
  /** Passed straight through to the trigger, so it matches the row it sits in. */
  size?: "sm";
}) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(expectedAt);

  const [state, formAction] = useActionState(
    async (previous: PoActionState, formData: FormData): Promise<PoActionState> => {
      const result = await markPurchaseOrderedAction(
        purchaseOrderId,
        previous,
        formData,
      );
      if (result.ok) {
        setOpen(false);
        toast.success("Marked as ordered.");
      }
      return result;
    },
    EMPTY,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size}>
          <Truck />
          Mark Ordered
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as ordered</DialogTitle>
          <DialogDescription>
            Records that this order has been placed with the vendor, and when it
            should land.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="po-ordered-expected">Expected delivery</Label>
            <Input
              id="po-ordered-expected"
              name="expectedAt"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <p className="text-[13px] text-muted-foreground">
              Optional — leave blank if the vendor didn&rsquo;t commit to a date.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Mark ordered</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
