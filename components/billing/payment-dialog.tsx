"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
 * The card-machine half of this dialog, or absent when the shop has none.
 *
 * `record` is the Server Action that RETRIEVES the payment from Stripe and
 * verifies it against this invoice before writing a Payment — the browser only
 * ever passes an id along.
 */
export type PaymentTerminal = {
  /** Server-derived. Decides whether Stripe offers a practice machine. */
  testMode: boolean;
  record: (
    invoiceId: string,
    paymentIntentId: string,
  ) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  /**
   * Opens a hosted Stripe page for this balance. Offered only when no card
   * machine answers, so the counter still has a way to get paid.
   */
  paymentLink?: (
    invoiceId: string,
  ) => Promise<{ ok: true; url: string } | { ok: false; reason: string }>;
};

export type SquarePaymentTerminal = {
  devices: { id: string; name: string; status: string }[];
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
  squareTerminal,
  size,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  balanceCents: number;
  customerCreditCents: number;
  customerName: string;
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  size?: ButtonProps["size"];
  /** Absent when this shop has no card machine connected. */
  terminal?: PaymentTerminal;
  /** Square Terminal devices connected to this shop through Square OAuth. */
  squareTerminal?: SquarePaymentTerminal;
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
  const [readerMode, setReaderMode] = React.useState<"stripe" | "square" | null>(null);
  const [amount, setAmount] = React.useState(() =>
    (Math.max(balanceCents, 0) / 100).toFixed(2),
  );

  // Reset to a fresh default every time the dialog is opened.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setAmount((Math.max(balanceCents, 0) / 100).toFixed(2));
      setMethod("CARD");
      setReaderMode(null);
    }
    setOpen(next);
  };

  const creditShort =
    method === "CREDIT" && customerCreditCents < Math.round(Number(amount) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size={size}>
          <ACTIONS.pay /> Take payment
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take a payment</DialogTitle>
          <DialogDescription>
            {formatCents(balanceCents)} outstanding from {customerName}.
          </DialogDescription>
        </DialogHeader>

        {terminal && readerMode === "stripe" ? (
          <ReaderPayment
            invoiceId={invoiceId}
            balanceCents={balanceCents}
            terminal={terminal}
            onKeyIn={() => setReaderMode(null)}
            onDone={() => setOpen(false)}
          />
        ) : squareTerminal && readerMode === "square" ? (
          <SquareReaderPayment
            invoiceId={invoiceId}
            balanceCents={balanceCents}
            terminal={squareTerminal}
            onKeyIn={() => setReaderMode(null)}
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
              onClick={() => setReaderMode("stripe")}
            >
              <ACTIONS.pay /> Take it on Stripe Terminal
            </Button>
          ) : null}

          {squareTerminal && squareTerminal.devices.length > 0 ? (
            <Button
              type="button"
              variant="soft"
              size="lg"
              className="h-13"
              onClick={() => setReaderMode("square")}
            >
              <ACTIONS.pay /> Take it on Square Terminal
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

function SquareReaderPayment({
  invoiceId,
  balanceCents,
  terminal,
  onKeyIn,
  onDone,
}: {
  invoiceId: string;
  balanceCents: number;
  terminal: SquarePaymentTerminal;
  onKeyIn: () => void;
  onDone: () => void;
}) {
  const [deviceId, setDeviceId] = React.useState(terminal.devices[0]?.id ?? "");
  const [message, setMessage] = React.useState("Ready when you are.");
  const [busy, setBusy] = React.useState(false);
  const [approved, setApproved] = React.useState(false);
  const alive = React.useRef(true);

  React.useEffect(() => () => {
    alive.current = false;
  }, []);

  const start = async () => {
    if (!deviceId) return;
    setBusy(true);
    setMessage("Sending the amount to Square Terminal…");
    try {
      const response = await fetch("/api/payments/square/terminal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, deviceId }),
      });
      const created = await response.json().catch(() => null) as { checkoutId?: string; error?: string } | null;
      if (!response.ok || !created?.checkoutId) throw new Error(created?.error ?? "Could not start Square Terminal.");
      setMessage("Present card on Square Terminal…");

      for (let attempt = 0; attempt < 150 && alive.current; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const statusResponse = await fetch(`/api/payments/square/terminal/checkout?id=${encodeURIComponent(created.checkoutId)}`, {
          cache: "no-store",
        });
        const status = await statusResponse.json().catch(() => null) as { status?: string; error?: string } | null;
        if (!statusResponse.ok) throw new Error(status?.error ?? "Could not verify the Square payment.");
        if (status?.status === "completed") {
          setMessage("Approved");
          setApproved(true);
          setBusy(false);
          toast.success(`Approved — ${formatCents(balanceCents)} recorded from Square.`);
          return;
        }
        if (status?.status === "canceled") throw new Error("Square Terminal canceled the payment.");
      }
      throw new Error("Square Terminal did not finish in time. Check the invoice before trying again.");
    } catch (error) {
      if (!alive.current) return;
      setMessage(error instanceof Error ? error.message : "Square Terminal could not complete the payment.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface-hover p-4">
        <p className="text-sm font-semibold text-foreground">Square Terminal</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        {terminal.devices.length > 1 && !busy ? (
          <div className="mt-4">
            <Label htmlFor="square-terminal-device">Machine</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger id="square-terminal-device" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terminal.devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>{device.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {!approved ? (
          <Button type="button" size="lg" className="mt-4 w-full" disabled={busy || !deviceId} onClick={() => void start()}>
            {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.pay />}
            {busy ? "Waiting for customer…" : `Charge ${formatCents(balanceCents)}`}
          </Button>
        ) : null}
      </div>
      <DialogFooter>
        {approved ? (
          <Button type="button" onClick={onDone}>Done</Button>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={onKeyIn}>Record it by hand instead</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}

/**
 * Taking the card on a machine instead of typing an auth code.
 *
 * The amount is not asked for and cannot be edited: /api/payments/terminal/intent
 * prices it from the invoice's own lines and payments, so what the customer
 * taps against is what the invoice actually owes.
 *
 * When no machine answers, the panel says so in one sentence and offers a
 * payment link for the same balance rather than leaving the counter stuck.
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
        fallback={
          terminal.paymentLink ? (
            <PaymentLinkButton
              invoiceId={invoiceId}
              action={terminal.paymentLink}
            />
          ) : null
        }
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

/**
 * The way out when no card machine answers.
 *
 * Copies a hosted Stripe link for exactly this balance, which the counter can
 * text or email while the customer is still standing there. Same action the
 * Share row uses, so there is one implementation of "what does this invoice
 * cost" and not two.
 */
function PaymentLinkButton({
  invoiceId,
  action,
}: {
  invoiceId: string;
  action: (
    invoiceId: string,
  ) => Promise<{ ok: true; url: string } | { ok: false; reason: string }>;
}) {
  const [busy, setBusy] = React.useState(false);

  const copy = async () => {
    setBusy(true);
    const result = await action(invoiceId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success("Payment link copied — send it to the customer to pay by card.");
    } catch {
      toast.error("Couldn't reach the clipboard on this device.");
    }
  };

  return (
    <Button type="button" variant="outline" size="lg" disabled={busy} onClick={copy}>
      {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
      Copy a payment link instead
    </Button>
  );
}
