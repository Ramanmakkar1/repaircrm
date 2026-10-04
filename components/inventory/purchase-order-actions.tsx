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

/** Dialog buttons in every mode: a dialog renders outside the page, where the Easy-mode sizing never reaches. */
const DIALOG_BUTTON = "h-12 px-5 text-base";

const EMPTY: PoActionState = {};

/**
 * Everything you can do to a purchase order, in the order you do it: place it,
 * send it to the supplier, book the delivery in, or call it off.
 *
 * Buttons that would fail are simply not rendered — a disabled control that
 * explains itself in a toast after the click is worse than one that was never
 * there, and the server enforces the same rules regardless. The one exception is
 * the booking-in sheet: it stays mounted after the last delivery (only its
 * button goes), so its "Booked in" screen survives the page refreshing.
 */
export function PurchaseOrderActions({
  purchaseOrderId,
  status,
  lines,
  vendorEmail,
  expectedAt,
  size,
  easy = false,
  autoReceive = false,
  heading,
  children,
}: {
  purchaseOrderId: string;
  status: string;
  lines: ReceivableLine[];
  /** Null hides "Email to supplier" — there is nowhere to send it. */
  vendorEmail: string | null;
  /** yyyy-mm-dd, to seed the "mark ordered" date field. */
  expectedAt: string;
  /**
   * Height of the buttons this renders into a page header's action row.
   *
   * Defaults to undefined, i.e. the Button default — every existing call site
   * keeps exactly what it had. The PO detail page passes "sm" so these line up
   * with the Print button beside them.
   */
  size?: "sm";
  /**
   * Easy mode: big 48px buttons, and ONE black button, the step this order needs
   * next (place it, or book the delivery in), listed first. Everything else
   * stays reachable as an outline button. Off by default, so the dense header
   * keeps exactly what it had.
   */
  easy?: boolean;
  /** Open the booking-in sheet straight away (the list's "Book in delivery" button). */
  autoReceive?: boolean;
  /** "Order #1001 from Meridian", shown in the booking-in sheet. */
  heading?: string;
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
      else toast.success(`Order sent to ${vendorEmail}.`);
    });

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelPurchaseOrderAction(purchaseOrderId);
      setConfirmingCancel(false);
      if (result.error) toast.error(result.error);
      else toast.success("Order canceled.");
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
      {easy ? "Email to supplier" : "Email to Vendor"}
    </Button>
  ) : null;

  // Always mounted while the order has lines: only its trigger depends on there being something to book in.
  const receiveButton =
    lines.length > 0 ? (
      <ReceivePoDialog
        key="receive"
        purchaseOrderId={purchaseOrderId}
        lines={lines}
        available={canReceive}
        defaultOpen={autoReceive && canReceive}
        heading={heading}
        trigger={
          <Button size={buttonSize} variant={easy && next !== "receive" ? "outline" : "default"} className={big}>
            <ACTIONS.receive />
            {easy ? "Book in delivery" : "Receive"}
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
          <DialogTitle className="text-lg">Cancel this order?</DialogTitle>
          <DialogDescription className="text-[15px]">
            It stays on file as canceled. Nothing is deleted and no stock
            moves, but it can&rsquo;t be booked in or opened again afterwards.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className={DIALOG_BUTTON}
            disabled={busy}
            onClick={() => setConfirmingCancel(false)}
          >
            Keep it
          </Button>
          <Button variant="destructive" className={DIALOG_BUTTON} disabled={busy} onClick={cancel}>
            {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.void />}
            {busy ? "Canceling…" : "Cancel order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  const extra = children ? <React.Fragment key="extra">{children}</React.Fragment> : null;

  // Keyed arrays, not positional children: when the order moves on (draft -> ordered -> received)
  // the buttons change places, and keys keep each one (and the open booking-in sheet) the same
  // component instead of a fresh one.
  if (next === "receive") return <>{[receiveButton, orderButton, emailButton, extra, cancelButton]}</>;
  return <>{[orderButton, emailButton, receiveButton, extra, cancelButton]}</>;
}

/**
 * DRAFT → ORDERED, with the date the supplier promised.
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
          <DialogTitle className="text-lg">Mark as ordered</DialogTitle>
          <DialogDescription className="text-[15px]">
            You have sent this order to the supplier. When did they say it will arrive?
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="po-ordered-expected" className="text-base">Arriving on</Label>
            <Input
              id="po-ordered-expected"
              name="expectedAt"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-12 text-base"
            />
            <p className="text-[14px] text-muted-foreground">
              Leave it blank if they didn&rsquo;t say.
            </p>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" className={DIALOG_BUTTON} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…" className={DIALOG_BUTTON}>Mark as ordered</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
