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
  PICKUP_TITLE_ID,
  pickupButtonContext,
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
 *
 * Every card has the same three button names, so each one also carries, for a
 * screen reader only, which repair it is for ("Hand over, #1015, Latitude 5420,
 * Daniel Brooks"): a list of ten "Open repair" buttons says nothing.
 *
 * After a hand-over the card leaves the list (the repair is no longer ready for
 * pickup), so focus is moved to the next card's title, else the one before,
 * else the page title, instead of falling to the top of the page.
 */
export function PickupCardActions({
  ticketId,
  number,
  customerName,
  device,
  money,
  plan,
  unbilledCharges,
}: {
  ticketId: string;
  number: number;
  customerName: string;
  /** The device's name, for the buttons' screen-reader names. */
  device?: string | null;
  money: PickupMoney;
  plan: PickupPlan;
  unbilledCharges: number;
}) {
  const router = useRouter();
  const [handedOver, setHandedOver] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const repairHref = `/tickets/${ticketId}`;
  const forWhom = <span className="sr-only">, {pickupButtonContext(number, device, customerName)}</span>;

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
      forWhom={forWhom}
      onDone={() => {
        // Read before the buttons go: the card's place in the list is where focus lands next.
        const item = rootRef.current?.closest("li") ?? null;
        setHandedOver(true);
        window.setTimeout(() => focusAfterHandOver(item), 0);
        router.refresh();
      }}
    />
  );

  const openRepair = (variant: "primary" | "quiet") => (
    <Button asChild variant={variant === "primary" ? "default" : "outline"} className={variant === "primary" ? BIG : SMALL}>
      <Link href={repairHref}>
        <ICONS.ticket aria-hidden />
        Open repair
        {forWhom}
      </Link>
    </Button>
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-2.5">
      {plan.primary === "pay" && money.invoiceId ? (
        <Button asChild className={BIG}>
          <Link href={`/invoices/${money.invoiceId}`}>
            <ACTIONS.pay aria-hidden />
            Take payment
            {forWhom}
          </Link>
        </Button>
      ) : null}
      {plan.primary === "handover" ? handOver("primary") : null}
      {plan.primary === "invoice" ? (
        <CreateInvoiceButton ticketId={ticketId} number={number} unbilledCharges={unbilledCharges} forWhom={forWhom} />
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

/**
 * Where focus goes once a handed-over card is on its way out of the list: the
 * next card's title link, else the previous card's, else the page title. The
 * other cards keep their place in the DOM across the refresh (they are keyed by
 * repair), so the link focused here is the one still on screen afterwards.
 */
function focusAfterHandOver(item: Element | null) {
  const sibling = item?.nextElementSibling ?? item?.previousElementSibling ?? null;
  const target =
    sibling?.querySelector<HTMLElement>("h2 a[href]") ?? document.getElementById(PICKUP_TITLE_ID);
  target?.focus();
}

/** Hand the device back: asks, calls `markPickedUpAction`, says so. */
function HandOverButton({
  ticketId,
  number,
  customerName,
  money,
  unbilledCharges,
  variant,
  forWhom,
  onDone,
}: {
  ticketId: string;
  number: number;
  customerName: string;
  money: PickupMoney;
  unbilledCharges: number;
  variant: "primary" | "quiet";
  /** Screen-reader words naming the repair, so each card's button has its own name. */
  forWhom: React.ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Set once the hand-over went through: the trigger is about to go, so the dialog must not hand focus back to it.
  const done = React.useRef(false);
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
        done.current = true;
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
          {forWhom}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={DIALOG}
        onCloseAutoFocus={(event) => {
          if (done.current) event.preventDefault();
        }}
      >
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
  forWhom,
}: {
  ticketId: string;
  number: number;
  unbilledCharges: number;
  /** Screen-reader words naming the repair. */
  forWhom: React.ReactNode;
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
          {forWhom}
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
