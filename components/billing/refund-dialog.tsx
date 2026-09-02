"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Info } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE_FORM_STATE, type FormState } from "./types";

const METHODS = [
  { value: "CARD", label: "Card" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "CREDIT", label: "Store credit" },
  { value: "OTHER", label: "Other" },
] as const;

/** The sentinel Radix uses for "not linked to one payment" — it cannot hold "". */
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
};

/**
 * Issue a refund against an invoice.
 *
 * Defaults to the full refundable amount — a customer returning a repair
 * usually wants all of it back — and clamps to that ceiling on the way in as
 * well as on the server, so the common mistake (typing the invoice total on a
 * part-paid invoice) is caught before it costs a round trip.
 *
 * Linking a specific payment is optional and purely for the audit trail: the
 * money is fungible, but "which card did this come off?" is the first question
 * asked when a customer phones about it. Choosing a Stripe-taken payment
 * surfaces the reminder that this app records the fact, and the dashboard moves
 * the money.
 */
export function RefundDialog({
  action,
  invoiceId,
  refundableCents,
  payments,
  customerName,
  /** Pre-selects store credit — used when the invoice was paid with credit. */
  defaultMethod = "CARD",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  refundableCents: number;
  payments: RefundablePayment[];
  customerName: string;
  defaultMethod?: string;
}) {
  const [open, setOpen] = React.useState(false);
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
  const [method, setMethod] = React.useState(defaultMethod);
  const [paymentId, setPaymentId] = React.useState(NO_PAYMENT);
  // "Send it back to the card" vs "write down a refund that happened
  // elsewhere". Defaults to the card whenever that is possible, because it is
  // the one that actually returns the customer's money.
  const [viaStripe, setViaStripe] = React.useState(true);
  const [amount, setAmount] = React.useState(() =>
    (Math.max(refundableCents, 0) / 100).toFixed(2),
  );

  // Reset to a fresh default every time the dialog is opened.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setAmount((Math.max(refundableCents, 0) / 100).toFixed(2));
      setMethod(defaultMethod);
      setPaymentId(NO_PAYMENT);
      setViaStripe(true);
    }
    setOpen(next);
  };

  const typedCents = Math.round(Number(amount.replace(/[^0-9.\-]/g, "")) * 100);
  const overCeiling = Number.isFinite(typedCents) && typedCents > refundableCents;

  const linked = payments.find((payment) => payment.id === paymentId) ?? null;
  // A Stripe reversal needs a specific card payment to reverse, so it only
  // becomes available once one is chosen. The server enforces the same rule.
  const canGoToCard = Boolean(linked?.canRefundToCard) && method === "CARD";
  const refundToCard = canGoToCard && viaStripe;
  // The dashboard warning is for the leftover case: Stripe money we cannot
  // reverse from here, either because no payment is linked or because the row
  // predates the PaymentIntent id being stored.
  const stripeInvolved =
    !refundToCard &&
    (linked ? linked.isStripe : payments.some((payment) => payment.isStripe));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ACTIONS.refund /> Refund
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a refund</DialogTitle>
          <DialogDescription>
            {formatCents(refundableCents)} of what {customerName} paid is
            available to refund.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-amount">Amount</Label>
              <Input
                id="refund-amount"
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="h-12 text-right text-lg font-bold tabular-nums"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-method">Method</Label>
              <Select name="method" value={method} onValueChange={setMethod}>
                <SelectTrigger id="refund-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {overCeiling ? (
            <p className="rounded-md bg-destructive-soft px-3 py-2 text-[13.5px] font-medium text-destructive">
              Only {formatCents(refundableCents)} came in on this invoice — a
              refund cannot exceed it.
            </p>
          ) : null}

          {payments.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-payment">Against payment</Label>
              <Select value={paymentId} onValueChange={setPaymentId}>
                <SelectTrigger id="refund-payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NO_PAYMENT}>
                    Not tied to one payment
                  </SelectItem>
                  {payments.map((payment) => (
                    <SelectItem key={payment.id} value={payment.id}>
                      {payment.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="refund-reason">Reason</Label>
            <Input
              id="refund-reason"
              name="reason"
              placeholder="Returned part, goodwill, duplicate charge…"
              maxLength={500}
            />
          </div>

          {method === "CREDIT" ? (
            <p className="rounded-md bg-surface-hover px-3 py-2 text-[13.5px] text-muted-foreground">
              This adds {formatCents(Math.max(typedCents || 0, 0))} to{" "}
              {customerName}&rsquo;s store credit instead of handing cash back.
            </p>
          ) : null}

          {canGoToCard ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                How this refund happens
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                <RefundRoute
                  selected={viaStripe}
                  onSelect={() => setViaStripe(true)}
                  title="Refund to card (Stripe)"
                  detail="Sends the money back to the card it came from."
                />
                <RefundRoute
                  selected={!viaStripe}
                  onSelect={() => setViaStripe(false)}
                  title="Record manual refund"
                  detail="You already handed it back some other way."
                />
              </div>
            </div>
          ) : null}

          {stripeInvolved && method !== "CREDIT" ? (
            <p className="flex items-start gap-2.5 rounded-md bg-status-waiting-bg px-3 py-2 text-[13.5px] font-medium text-status-waiting-fg">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                {linked
                  ? "This payment has no Stripe payment id on file, so process the refund in your Stripe dashboard too — this only records it on the invoice."
                  : "Some of this money came in through Stripe. Pick that payment above to send the refund back to the card; otherwise process it in your Stripe dashboard as well."}
              </span>
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              variant="destructive"
              pendingLabel="Refunding…"
              disabled={overCeiling}
            >
              {refundToCard ? "Refund to card" : "Record refund"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One of the two routes a refund can take.
 *
 * A pair of buttons rather than a Select: there are exactly two, they do
 * genuinely different things to the customer's money, and both need a sentence
 * of explanation that a dropdown has nowhere to put.
 */
function RefundRoute({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3.5 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-accent/50 bg-accent-soft text-accent-soft-foreground"
          : "border-border bg-surface text-muted-foreground hover:bg-surface-hover",
      )}
    >
      <span className="text-[14px] font-bold text-foreground">{title}</span>
      <span className="text-[13px] leading-snug">{detail}</span>
    </button>
  );
}
