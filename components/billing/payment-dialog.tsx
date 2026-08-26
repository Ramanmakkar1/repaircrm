"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CreditCard } from "lucide-react";

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
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  balanceCents: number;
  customerCreditCents: number;
  customerName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  const [method, setMethod] = React.useState<string>("CARD");
  const [amount, setAmount] = React.useState(() =>
    (Math.max(balanceCents, 0) / 100).toFixed(2),
  );

  const done = state.done;
  React.useEffect(() => {
    if (done) setOpen(false);
  }, [done]);

  // Reset to a fresh default every time the dialog is opened.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setAmount((Math.max(balanceCents, 0) / 100).toFixed(2));
      setMethod("CARD");
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

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />

          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="text-right tabular-nums"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
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
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
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
      </DialogContent>
    </Dialog>
  );
}
