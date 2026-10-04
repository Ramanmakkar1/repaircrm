"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { markPickedUpAction, makeInvoiceAction } from "@/app/(app)/tickets/actions";
import {
  handedOverMessage,
  handOverNote,
  handOverQuestion,
  invoiceNote,
  invoiceQuestion,
  type PickupMoney,
  type PickupPlan,
} from "./pickup-card-facts";

const BIG = "h-14 w-full text-base [&_svg]:size-5";
const SMALL = "h-12 flex-1 basis-40 text-[15px]";
const DIALOG = "w-[calc(100%-2rem)] max-w-md";

/**
 * The buttons at the foot of a pickup card: one big one chosen by the card's
 * state, and the quiet ones beside it.
 *
 * Every press either goes somewhere that already exists (the invoice, the
 * repair) or calls a server action that already exists (`markPickedUpAction`,
 * `makeInvoiceAction`). Handing a device back and making an invoice both ask
 * first, in words, with the customer's name in the question.
 *
 * Handing over is not undoable (it closes the repair and clears the stored
 * unlock code), so it gets a plain toast rather than an Undo that could not
 * really put it back.
 */
export function PickupCardActions({
  ticketId,
  number,
  customerName,
  money,
  plan,
  unbilledCharges,
}: {
  ticketId: string;
  number: number;
  customerName: string;
  money: PickupMoney;
  plan: PickupPlan;
  unbilledCharges: number;
}) {
  const router = useRouter();
  const [handedOver, setHandedOver] = React.useState(false);
  const repairHref = `/tickets/${ticketId}`;

  if (handedOver) {
    return (
      <p
        role="status"
        className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-status-resolved-bg px-4 text-base font-semibold text-status-resolved-fg"
      >
        <ACTIONS.approve className="size-5" aria-hidden />
        Handed over
      </p>
    );
  }

  const handOver = (variant: "primary" | "quiet") => (
    <HandOverButton
      ticketId={ticketId}
      number={number}
      customerName={customerName}
      money={money}
      unbilledCharges={unbilledCharges}
      variant={variant}
      onDone={() => {
        setHandedOver(true);
        router.refresh();
      }}
    />
  );

  const openRepair = (variant: "primary" | "quiet") => (
    <Button asChild variant={variant === "primary" ? "default" : "outline"} className={variant === "primary" ? BIG : SMALL}>
      <Link href={repairHref}>
        <ICONS.ticket aria-hidden />
        Open repair
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-2.5">
      {plan.primary === "pay" && money.invoiceId ? (
        <Button asChild className={BIG}>
          <Link href={`/invoices/${money.invoiceId}`}>
            <ACTIONS.pay aria-hidden />
            Take payment
          </Link>
        </Button>
      ) : null}
      {plan.primary === "handover" ? handOver("primary") : null}
      {plan.primary === "invoice" ? (
        <CreateInvoiceButton ticketId={ticketId} number={number} unbilledCharges={unbilledCharges} />
      ) : null}
      {plan.primary === "open" ? openRepair("primary") : null}

      {plan.openRepair || plan.handOverAnyway ? (
        <div className="flex flex-wrap gap-2.5">
          {plan.openRepair ? openRepair("quiet") : null}
          {plan.handOverAnyway ? handOver("quiet") : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Hand the device back: asks, calls `markPickedUpAction`, says so. */
function HandOverButton({
  ticketId,
  number,
  customerName,
  money,
  unbilledCharges,
  variant,
  onDone,
}: {
  ticketId: string;
  number: number;
  customerName: string;
  money: PickupMoney;
  unbilledCharges: number;
  variant: "primary" | "quiet";
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const primary = variant === "primary";
  // Handing over with money still to sort out reads as what it is.
  const label = primary ? "Hand over" : "Hand over anyway";

  function confirm() {
    setBusy(true);
    startTransition(async () => {
      try {
        const result = await markPickedUpAction(ticketId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setOpen(false);
        toast.success(handedOverMessage(number, customerName));
        onDone();
      } catch {
        toast.error("Could not hand that over. Check the connection and try again.");
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={primary ? "default" : "outline"} className={primary ? BIG : SMALL}>
          <ACTIONS.receive aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle className="text-lg">{handOverQuestion(number, customerName)}</DialogTitle>
          <DialogDescription className="text-base">{handOverNote(money, unbilledCharges)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2.5 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-12 w-full text-base sm:w-auto" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" className="h-12 w-full text-base sm:w-auto" disabled={busy} onClick={confirm}>
            <ACTIONS.receive aria-hidden />
            {busy ? "Handing over…" : "Hand over"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * No invoice yet, and there are charges to bill: asks, then calls
 * `makeInvoiceAction`, which makes the draft and takes you to it.
 */
function CreateInvoiceButton({
  ticketId,
  number,
  unbilledCharges,
}: {
  ticketId: string;
  number: number;
  unbilledCharges: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  function confirm() {
    setBusy(true);
    startTransition(async () => {
      try {
        // Success redirects to the new invoice; only a refusal comes back.
        const result = await makeInvoiceAction(ticketId);
        if (result?.error) toast.error(result.error);
      } catch (error) {
        // A redirect is thrown through the action boundary and handled by the
        // framework; anything else is a real failure.
        if (!isRedirect(error)) toast.error("Could not create the invoice. Try again.");
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button className={BIG}>
          <ICONS.invoice aria-hidden />
          Create invoice
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle className="text-lg">{invoiceQuestion(number)}</DialogTitle>
          <DialogDescription className="text-base">{invoiceNote(unbilledCharges)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2.5 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-12 w-full text-base sm:w-auto" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" className="h-12 w-full text-base sm:w-auto" disabled={busy} onClick={confirm}>
            <ICONS.invoice aria-hidden />
            {busy ? "Creating…" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
