"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Info } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
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
import { cn } from "@/components/ui/cn";
import { formatCents, parseCents } from "@/lib/money";
import { SubmitButton } from "@/components/ui/submit-button";
import { QuickAmount } from "@/components/pos/tender-pieces";
import { MethodTiles } from "./payment-dialog";
import { IDLE_FORM_STATE, type FormState } from "./types";
import { useDialogOpen, type ControlledDialog } from "./dialog-open";

/** The sentinel for "not linked to one payment" (a radio needs a value). */
const NO_PAYMENT = "__none__";

/** One collected payment this refund can be pinned to. */
export type RefundablePayment = {
  id: string;
  label: string;
  amountCents: number;
  /** True when the money came in through Stripe. */
  isStripe: boolean;
  /**
   * True when we hold the PaymentIntent id, which is what a Stripe refund is
   * issued against. A pre-Wave-8 Checkout payment can be `isStripe` without
   * this — the money came through Stripe, but the reversal has to be done from
   * the dashboard.
   */
  canRefundToCard: boolean;
  /** CARD, CASH, ... Optional for older callers. */
  method?: string;
};

/** Ready-made reasons, one tap each. The field stays free text. */
const REASONS = ["Item returned", "Couldn't fix it", "Goodwill", "Charged twice"] as const;

/** The method tiles' words on a refund: where the money goes. */
const REFUND_LABELS = { CARD: "Their card", CASH: "Cash", CHECK: "Check", CREDIT: "Store credit", OTHER: "Other" } as const;

/** The payment a card refund should go back to by default: the newest one that can. */
export function defaultRefundPayment(payments: readonly RefundablePayment[], method: string): string {
  if (method !== "CARD") return NO_PAYMENT;
  const card = [...payments].reverse().find((payment) => payment.canRefundToCard);
  return card?.id ?? NO_PAYMENT;
}

/**
 * What will happen, in one plain sentence, before anything is pressed. A
 * clerk must never think "Give back" on Card moved money when it only wrote it
 * down, so the two card routes read differently.
 */
export function refundOutcome(input: {
  amountCents: number;
  method: string;
  toCard: boolean;
  paymentLabel?: string | null;
  customerName: string;
}): string {
  const amount = formatCents(Math.max(input.amountCents, 0));
  if (input.toCard) {
    return `${amount} goes back to the card it was paid with${
      input.paymentLabel ? ` (${input.paymentLabel})` : ""
    }. It can take a few days to reach them.`;
  }
  switch (input.method) {
    case "CARD":
      return `${amount} is written down as given back on a card. Give it back on your card machine too: this does not move the money.`;
    case "CASH":
      return `Take ${amount} out of the cash drawer and hand it over.`;
    case "CHECK":
      return `Write ${input.customerName} a check for ${amount}.`;
    case "CREDIT":
      return `Adds ${amount} to ${input.customerName}'s store credit to spend next time.`;
    default:
      return `${amount} is written down as given back.`;
  }
}

/**
 * Give money back on an invoice.
 *
 * Defaults to the full refundable amount — a customer returning a repair
 * usually wants all of it back — and clamps to that ceiling on the way in as
 * well as on the server, so the common mistake (typing the invoice total on a
 * part-paid invoice) is caught before it costs a round trip.
 *
 * Same big method tiles as Take payment. When the money came in on a card the
 * shop can reverse from here, that payment is picked for you and "Send it back
 * to the card" is the default, so the obvious button really returns the money;
 * the plain sentence above the button says what will happen either way.
 *
 * Posts exactly what it always did: invoiceId, amount, method, paymentId,
 * viaStripe and reason.
 */
export function RefundDialog({
  action,
  invoiceId,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  refundableCents,
  payments,
  customerName,
  /** Pre-selects store credit — used when the invoice was paid with credit. */
  defaultMethod = "CARD",
  owingNowCents,
  size,
}: ControlledDialog & {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  refundableCents: number;
  payments: RefundablePayment[];
  customerName: string;
  defaultMethod?: string;
  /** What the invoice owes now (refund-aware), so the dialog can say what it will owe after. */
  owingNowCents?: number;
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  size?: ButtonProps["size"];
}) {
  const [method, setMethod] = React.useState(defaultMethod);
  const [paymentId, setPaymentId] = React.useState(() => defaultRefundPayment(payments, defaultMethod));
  // "Send it back to the card" vs "I already gave it back another way".
  // Defaults to the card whenever that is possible, because it is the one
  // that actually returns the customer's money.
  const [viaStripe, setViaStripe] = React.useState(true);
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState(() =>
    (Math.max(refundableCents, 0) / 100).toFixed(2),
  );

  // The declaration order in this block is load-bearing: the reset closure
  // below reaches the field setters above it, and the submit handler below
  // reaches `setOpen`. Both would be a temporal-dead-zone read the other way
  // round, which is a runtime crash the compiler lint catches for us.
  const { open, setOpen, controlled } = useDialogOpen({
    open: openProp,
    onOpenChange: onOpenChangeProp,
    // Reset to a fresh default every time the dialog opens — from its own
    // trigger or from the overflow menu, which flips `open` without ever
    // calling `onOpenChange`.
    onOpen: () => {
      setAmount((Math.max(refundableCents, 0) / 100).toFixed(2));
      setMethod(defaultMethod);
      setPaymentId(defaultRefundPayment(payments, defaultMethod));
      setViaStripe(true);
      setReason("");
    },
  });

  // Submitting is what closes the dialog, so the close lives in the action
  // itself rather than in an effect waiting for `state.done` to land.
  const [state, formAction] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.done) setOpen(false);
      return result;
    },
    IDLE_FORM_STATE,
  );

  const typedCents = parseCents(amount);
  const overCeiling = typedCents > refundableCents;
  const fullCents = Math.max(refundableCents, 0);

  const pickMethod = (next: string) => {
    setMethod(next);
    // A card refund starts on the card payment it can go back to; anything
    // else starts unlinked (the link is only for the record).
    setPaymentId(defaultRefundPayment(payments, next));
  };

  const linked = payments.find((payment) => payment.id === paymentId) ?? null;
  // A Stripe reversal needs a specific card payment to reverse, so it only
  // becomes available once one is chosen. The server enforces the same rule.
  const canGoToCard = Boolean(linked?.canRefundToCard) && method === "CARD";
  const refundToCard = canGoToCard && viaStripe;
  const cardPayments = payments.filter((payment) => payment.canRefundToCard);
  // The plain-words warning is for the leftover case: Stripe money we cannot
  // reverse from here, either because no payment is linked or because the row
  // predates the PaymentIntent id being stored.
  const stripeInvolved =
    !refundToCard &&
    (linked ? linked.isStripe : payments.some((payment) => payment.isStripe));
  const owingAfter =
    owingNowCents === undefined ? null : Math.max(owingNowCents, 0) + Math.max(typedCents, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled ? null : (
        <DialogTrigger asChild>
          <Button variant="outline" size={size}>
            <ACTIONS.refund /> Refund
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Give money back</DialogTitle>
          <DialogDescription>
            Up to {formatCents(refundableCents)} of what {customerName} paid
            can go back.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input
            type="hidden"
            name="paymentId"
            value={paymentId === NO_PAYMENT ? "" : paymentId}
          />
          <input
            type="hidden"
            name="viaStripe"
            value={refundToCard ? "true" : "false"}
          />

          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="refund-amount">How much goes back?</Label>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">
                $
              </span>
              <Input
                id="refund-amount"
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="h-14 pl-10 text-right text-2xl font-bold tabular-nums"
                autoFocus
              />
            </div>
            {fullCents > 1 ? (
              <div className="grid grid-cols-2 gap-2">
                <QuickAmount
                  label={`All of it · ${formatCents(fullCents)}`}
                  pressed={typedCents === fullCents}
                  onClick={() => setAmount((fullCents / 100).toFixed(2))}
                />
                <QuickAmount
                  label={`Half · ${formatCents(Math.round(fullCents / 2))}`}
                  pressed={typedCents === Math.round(fullCents / 2)}
                  onClick={() => setAmount((Math.round(fullCents / 2) / 100).toFixed(2))}
                />
              </div>
            ) : null}
          </div>

          {overCeiling ? (
            <p role="alert" className="rounded-md bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
              Only {formatCents(refundableCents)} came in on this invoice, so no
              more than that can go back.
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label id="refund-method-label">How does it go back?</Label>
            <MethodTiles value={method} onChange={pickMethod} labelId="refund-method-label" labels={REFUND_LABELS} />
          </div>

          {method === "CARD" && cardPayments.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Which card payment?</legend>
              <div role="radiogroup" aria-label="Which card payment" className="flex flex-col gap-2">
                {cardPayments.map((payment) => (
                  <ChoiceRow
                    key={payment.id}
                    selected={paymentId === payment.id}
                    onSelect={() => setPaymentId(payment.id)}
                    title={payment.label}
                  />
                ))}
                <ChoiceRow
                  selected={paymentId === NO_PAYMENT}
                  onSelect={() => setPaymentId(NO_PAYMENT)}
                  title="A card payment not listed here"
                />
              </div>
            </fieldset>
          ) : null}

          {canGoToCard ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Send the money now?</legend>
              <div role="radiogroup" aria-label="Send the money now" className="grid gap-2 sm:grid-cols-2">
                <ChoiceRow
                  selected={viaStripe}
                  onSelect={() => setViaStripe(true)}
                  title="Send it back to the card"
                  detail="The money goes back to the card it came from."
                />
                <ChoiceRow
                  selected={!viaStripe}
                  onSelect={() => setViaStripe(false)}
                  title="I already gave it back"
                  detail="Only write it down. Nothing is sent."
                />
              </div>
            </fieldset>
          ) : null}

          {method !== "CARD" && payments.length > 1 ? (
            <details className="rounded-xl border border-border">
              <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                Which payment was it? (optional)
              </summary>
              <div role="radiogroup" aria-label="Which payment was it" className="flex flex-col gap-2 border-t border-border p-3">
                <ChoiceRow selected={paymentId === NO_PAYMENT} onSelect={() => setPaymentId(NO_PAYMENT)} title="Not one payment in particular" />
                {payments.map((payment) => (
                  <ChoiceRow
                    key={payment.id}
                    selected={paymentId === payment.id}
                    onSelect={() => setPaymentId(payment.id)}
                    title={payment.label}
                  />
                ))}
              </div>
            </details>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="refund-reason">Why? (optional)</Label>
            <Input
              id="refund-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Item returned, couldn't fix it…"
              maxLength={500}
              className="h-12"
            />
            <div className="flex flex-wrap gap-2">
              {REASONS.map((word) => (
                <QuickAmount
                  key={word}
                  label={word}
                  pressed={reason === word}
                  onClick={() => setReason(word)}
                  className="px-3 font-semibold"
                />
              ))}
            </div>
          </div>

          <div role="status" className="flex flex-col gap-1 rounded-xl bg-surface-hover px-4 py-3 text-[15px] leading-relaxed">
            <span className="font-semibold text-foreground">
              {refundOutcome({
                amountCents: typedCents,
                method,
                toCard: refundToCard,
                paymentLabel: linked?.label ?? null,
                customerName,
              })}
            </span>
            {owingAfter !== null && owingAfter > 0 ? (
              <span className="text-muted-foreground">
                A refund puts the money back on the bill, so the invoice then
                shows {formatCents(owingAfter)} owing.
              </span>
            ) : null}
          </div>

          {stripeInvolved && method !== "CREDIT" ? (
            <p className="flex items-start gap-2.5 rounded-md bg-status-waiting-bg px-4 py-3 text-[15px] font-medium text-status-waiting-fg">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                {linked
                  ? "This card payment can't be sent back from here. Give it back in your Stripe account too; this only writes it on the invoice."
                  : "Some of this money came in by card online. Pick that payment above to send it back to the card, or give it back in your Stripe account too."}
              </span>
            </p>
          ) : null}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2.5">
            <Button type="button" variant="outline" className="h-12 w-full px-5 text-base sm:w-auto" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              pendingLabel="Giving it back…"
              disabled={overCeiling || typedCents <= 0}
              className="h-12 w-full px-5 text-base sm:w-auto"
            >
              {refundToCard
                ? `Refund ${formatCents(Math.max(typedCents, 0))} to the card`
                : `Give back ${formatCents(Math.max(typedCents, 0))}`}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One choice in a short list (which payment, which route): a 48px row with
 * its words, the chosen one outlined and marked, never colour alone.
 */
function ChoiceRow({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-accent bg-accent-soft text-accent-soft-foreground ring-1 ring-accent"
          : "border-border bg-surface text-foreground hover:bg-surface-hover",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-accent" : "border-border-strong",
        )}
      >
        {selected ? <span className="size-2.5 rounded-full bg-accent" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-foreground [overflow-wrap:anywhere]">{title}</span>
        {detail ? <span className="text-[14px] leading-snug text-muted-foreground">{detail}</span> : null}
      </span>
    </button>
  );
}
