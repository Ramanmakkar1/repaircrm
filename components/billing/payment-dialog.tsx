"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";

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
import { TerminalPanel } from "@/components/payments/terminal-panel";
import { useStripeTerminal } from "@/components/payments/use-stripe-terminal";
import { formatCents } from "@/lib/money";
import { offerReceiptToast, type ReceiptAction } from "./send-receipt";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE_FORM_STATE, type FormState } from "./types";

/**
 * The card-reader half of this dialog, or absent when the shop has no reader.
 *
 * `record` is the Server Action that RETRIEVES the intent from Stripe and
 * verifies it against this invoice before writing a Payment — the browser only
 * ever passes an id along.
 */
export type PaymentTerminal = {
  /** Server-derived. Decides whether Stripe offers a simulated reader. */
  testMode: boolean;
  record: (
    invoiceId: string,
    paymentIntentId: string,
  ) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
};

const METHODS = [
  { value: "CARD", label: "Card" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "CREDIT", label: "Store credit" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * Take-payment dialog. Defaults to the full outstanding balance — the
 * overwhelmingly common case at the counter — but accepts any amount up to it.
 *
 * Store credit is a special method: it draws down `customer.creditBalanceCents`
 * rather than taking new money, so the available balance is surfaced inline and
 * the server re-checks it inside the same transaction that writes the payment.
 */
export function PaymentDialog({
  action,
  invoiceId,
  balanceCents,
  customerCreditCents,
  customerName,
  receiptAction,
  terminal,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  balanceCents: number;
  customerCreditCents: number;
  customerName: string;
  /** Absent when this shop has no card reader paired. */
  terminal?: PaymentTerminal;
  /**
   * Optional. When the payment just recorded clears the balance, the success
   * toast carries an "Email receipt" button — the one moment the customer is
   * still standing at the counter to be asked.
   */
  receiptAction?: ReceiptAction;
}) {
  const [open, setOpen] = React.useState(false);
  // Submitting is what closes the dialog and offers the receipt, so both live
  // in the action itself rather than in an effect waiting for `state.done` to
  // land. Reading `receiptAction` straight from props is safe here for the
  // same reason: the action runs once per submit, so a re-created Server
  // Action reference can no longer re-offer a receipt that was already taken.
  const [state, formAction] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await action(previous, formData);
      if (!result.done) return result;

      setOpen(false);
      if (result.settled && receiptAction) {
        offerReceiptToast(
          invoiceId,
          receiptAction,
          "Paid in full — nothing left owing.",
        );
      }
      return result;
    },
    IDLE_FORM_STATE,
  );
  const [method, setMethod] = React.useState<string>("CARD");
  const [readerMode, setReaderMode] = React.useState(false);
  const [amount, setAmount] = React.useState(() =>
    (Math.max(balanceCents, 0) / 100).toFixed(2),
  );

  // Reset to a fresh default every time the dialog is opened.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setAmount((Math.max(balanceCents, 0) / 100).toFixed(2));
      setMethod("CARD");
      setReaderMode(false);
    }
    setOpen(next);
  };

  const creditShort =
    method === "CREDIT" && customerCreditCents < Math.round(Number(amount) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <CreditCard /> Take payment
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take a payment</DialogTitle>
          <DialogDescription>
            {formatCents(balanceCents)} outstanding from {customerName}.
          </DialogDescription>
        </DialogHeader>

        {terminal && readerMode ? (
          <ReaderPayment
            invoiceId={invoiceId}
            balanceCents={balanceCents}
            terminal={terminal}
            onKeyIn={() => setReaderMode(false)}
            onDone={() => setOpen(false)}
          />
        ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />

          {terminal ? (
            <Button
              type="button"
              variant="soft"
              size="lg"
              className="h-13"
              onClick={() => setReaderMode(true)}
            >
              <CreditCard /> Take it on the card reader
            </Button>
          ) : null}

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
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="h-12 text-right text-lg font-bold tabular-nums"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="method">Method</Label>
              <Select name="method" value={method} onValueChange={setMethod}>
                <SelectTrigger id="method">
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              name="reference"
              placeholder="Check #, auth code, last 4…"
            />
          </div>

          {method === "CREDIT" ? (
            <p
              className={
                creditShort
                  ? "rounded-md bg-destructive-soft px-3 py-2 text-[13.5px] font-medium text-destructive"
                  : "rounded-md bg-surface-hover px-3 py-2 text-[13.5px] text-muted-foreground"
              }
            >
              Store credit available: {formatCents(customerCreditCents)}
              {creditShort ? " — not enough to cover this amount." : ""}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Taking the card on a reader instead of typing an auth code.
 *
 * The amount is not asked for and cannot be edited: /api/payments/terminal/intent
 * prices it from the invoice's own lines and payments, so what the customer
 * taps against is what the invoice actually owes.
 */
function ReaderPayment({
  invoiceId,
  balanceCents,
  terminal,
  onKeyIn,
  onDone,
}: {
  invoiceId: string;
  balanceCents: number;
  terminal: PaymentTerminal;
  onKeyIn: () => void;
  onDone: () => void;
}) {
  const reader = useStripeTerminal(terminal.testMode);

  const start = () => {
    void reader.collect({
      createIntent: async () => {
        const response = await fetch("/api/payments/terminal/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId }),
        });
        const payload = (await response.json().catch(() => null)) as {
          id?: string;
          clientSecret?: string | null;
          error?: string;
        } | null;
        if (!response.ok || !payload?.id) {
          return {
            ok: false as const,
            error: payload?.error ?? "Could not start that payment.",
          };
        }
        return {
          ok: true as const,
          clientSecret: payload.clientSecret ?? null,
          paymentIntentId: payload.id,
        };
      },
      record: async (paymentIntentId) => {
        const result = await terminal.record(invoiceId, paymentIntentId);
        if (!result.ok) return { ok: false as const, error: result.error };
        // The action revalidates the invoice, which re-renders it as PAID and
        // takes this whole dialog away with it. A toast is what survives that
        // to tell the cashier the card went through.
        toast.success(result.message);
        return { ok: true as const };
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <TerminalPanel
        amountCents={balanceCents}
        terminal={reader}
        onStart={start}
        startLabel={`Charge ${formatCents(balanceCents)}`}
      />

      <DialogFooter>
        {reader.step === "approved" ? (
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={reader.busy}
              onClick={onKeyIn}
            >
              Record it by hand instead
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={reader.busy}
              onClick={onDone}
            >
              Cancel
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
