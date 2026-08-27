"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Info, Undo2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/money";
import { SubmitButton } from "./submit-button";
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
  /** True when the money came in through Stripe's hosted checkout. */
  isStripe: boolean;
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
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  const [method, setMethod] = React.useState(defaultMethod);
  const [paymentId, setPaymentId] = React.useState(NO_PAYMENT);
  const [amount, setAmount] = React.useState(() =>
    (Math.max(refundableCents, 0) / 100).toFixed(2),
  );

  const done = state.done;
  React.useEffect(() => {
    if (done) setOpen(false);
  }, [done]);

  // Reset to a fresh default every time the dialog is opened.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setAmount((Math.max(refundableCents, 0) / 100).toFixed(2));
      setMethod(defaultMethod);
      setPaymentId(NO_PAYMENT);
    }
    setOpen(next);
  };

  const typedCents = Math.round(Number(amount.replace(/[^0-9.\-]/g, "")) * 100);
  const overCeiling = Number.isFinite(typedCents) && typedCents > refundableCents;

  const linked = payments.find((payment) => payment.id === paymentId) ?? null;
  // The hint follows the LINKED payment when there is one, and otherwise warns
  // if any of the money on this invoice arrived through Stripe at all.
  const stripeInvolved = linked
    ? linked.isStripe
    : payments.some((payment) => payment.isStripe);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Undo2 /> Refund
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

          {stripeInvolved && method !== "CREDIT" ? (
            <p className="flex items-start gap-2.5 rounded-md bg-status-waiting-bg px-3 py-2 text-[13.5px] font-medium text-status-waiting-fg">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Process the refund in your Stripe dashboard too — this records
                the refund on the invoice, it does not move the money back.
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
              Issue refund
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
