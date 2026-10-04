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
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { ReceivePoDialog, type ReceivableLine } from "./receive-po-dialog";
import { nextPoAction } from "./easy-lists";
import { CANCELABLE_PO_STATUSES, RECEIVABLE_PO_STATUSES, asPoStatus } from "./purchasing";

/** Easy-mode buttons: a thumb-sized 48px, readable at arm's length. */
const BIG = "h-12 px-5 text-base [&_svg]:size-5";

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
  easy = false,
  children,
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
  /**
   * Easy mode: big 48px buttons, and ONE black button, the step this order needs
   * next (place it, or book the delivery in), listed first. Everything else
   * stays reachable as an outline button. Off by default, so the dense header
   * keeps exactly what it had.
   */
  easy?: boolean;
  /** Extra buttons (Print) that sit just before "Cancel order", so the quiet button stays last. */
  children?: React.ReactNode;
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

  const next = easy ? nextPoAction(current, canReceive) : null;
  const buttonSize = easy ? undefined : size;
  const big = easy ? BIG : undefined;

  const orderButton =
    current === "DRAFT" ? (
      <MarkOrderedDialog
        key="order"
        purchaseOrderId={purchaseOrderId}
        expectedAt={expectedAt}
        size={buttonSize}
        variant={next === "order" ? "default" : "outline"}
        className={big}
        label={easy ? "Mark as ordered" : "Mark Ordered"}
      />
    ) : null;

  const emailButton = vendorEmail ? (
    <Button key="email" variant="outline" size={buttonSize} className={big} disabled={busy} onClick={email}>
      {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.email />}
      Email to Vendor
    </Button>
  ) : null;

  const receiveButton = canReceive ? (
    <ReceivePoDialog
      key="receive"
      purchaseOrderId={purchaseOrderId}
      lines={lines}
      trigger={
        <Button size={buttonSize} variant={easy && next !== "receive" ? "outline" : "default"} className={big}>
          <ACTIONS.receive />
          Receive
        </Button>
      }
    />
  ) : null;

  // Calling off an order is not undoable from the UI, so it asks first —
  // and the confirm button wears the destructive colour, not the
  // quiet ghost the trigger does.
  const cancelButton = canCancel ? (
    <Dialog key="cancel" open={confirmingCancel} onOpenChange={setConfirmingCancel}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={buttonSize}
          disabled={busy}
          className={cn(easy ? "text-muted-foreground hover:text-destructive" : "text-faint-foreground hover:text-destructive", big)}
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
  ) : null;

  // Easy mode leads with the one black button; the dense header keeps its order.
  if (next === "receive") return <>{receiveButton}{orderButton}{emailButton}{children}{cancelButton}</>;
  return <>{orderButton}{emailButton}{receiveButton}{children}{cancelButton}</>;
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
  variant = "outline",
  className,
  label = "Mark Ordered",
}: {
  purchaseOrderId: string;
  expectedAt: string;
  /** Passed straight through to the trigger, so it matches the row it sits in. */
  size?: "sm";
  /** Black when this is the order's next step (Easy mode), outline otherwise. */
  variant?: "default" | "outline";
  className?: string;
  label?: string;
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
        <Button variant={variant} size={size} className={className}>
          <Truck />
          {label}
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
