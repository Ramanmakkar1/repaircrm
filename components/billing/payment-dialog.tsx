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
import { cn } from "@/components/ui/cn";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CardFlow } from "@/lib/payments/card-machine";
import { TerminalPanel } from "@/components/payments/terminal-panel";
import { useStripeTerminal } from "@/components/payments/use-stripe-terminal";
import { formatCents, parseCents } from "@/lib/money";
import { offerReceiptToast, type ReceiptAction } from "./send-receipt";
import { TILE_CLASS } from "./tile-style";
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
  cardFlow = "manual",
  size,
  appearance = "button",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  balanceCents: number;
  customerCreditCents: number;
  customerName: string;
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  size?: ButtonProps["size"];
  /**
   * How the trigger looks: the usual filled button, or one of the quick tiles
   * on a bill (icon over a word). Looks only; it opens the same dialog.
   */
  appearance?: "button" | "tile";
  /** Absent when this shop has no card machine connected. */
  terminal?: PaymentTerminal;
  /** Square Terminal devices connected to this shop through Square OAuth. */
  squareTerminal?: SquarePaymentTerminal;
  /**
   * What the dialog opens on, from Settings → Payments and resolved against
   * what is actually paired: straight onto a machine, a choice of two, or the
   * manual screen for a shop that keys the amount into its own machine.
   */
  cardFlow?: CardFlow;
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
      // An "automatic" shop lands on its machine with the balance already
      // going out to it; everyone else lands on the form.
      setReaderMode(
        cardFlow === "stripe" && terminal
          ? "stripe"
          : cardFlow === "square" && squareTerminal?.devices.length
            ? "square"
            : null,
      );
    }
    setOpen(next);
  };

  const creditShort =
    method === "CREDIT" && customerCreditCents < Math.round(Number(amount) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {appearance === "tile" ? (
          <button type="button" data-touch-control className={TILE_CLASS}>
            <ACTIONS.pay aria-hidden />
            Take payment
          </button>
        ) : (
          <Button size={size}>
            <ACTIONS.pay /> Take payment
          </Button>
        )}
      </DialogTrigger>

      {/* Scrolls inside the screen. With the tablet keyboard up, the amount
          field's footer buttons stay reachable instead of falling off the
          bottom. (The phone sheet has its own 92dvh limit.) */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
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

          {cardFlow !== "manual" ? (
            <ReaderButtons
              stripe={Boolean(terminal)}
              square={Boolean(squareTerminal?.devices.length)}
              onPick={setReaderMode}
            />
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="h-14 text-right text-2xl font-bold tabular-nums"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label id="method-label">Method</Label>
            <MethodTiles value={method} onChange={setMethod} />
          </div>

          {method === "CARD" ? (
            <p className="rounded-md bg-surface-hover px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Key{" "}
              <span className="font-bold tabular-nums text-foreground">
                {formatCents(Math.max(parseCents(amount), 0))}
              </span>{" "}
              into your card machine. When it says approved, press the button
              below.
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="reference">
              {method === "CARD" ? "Last 4 digits or approval code (optional)" : "Reference"}
            </Label>
            <Input
              id="reference"
              name="reference"
              placeholder={method === "CARD" ? "e.g. 4242" : "Check #, reference…"}
            />
          </div>

          {cardFlow === "manual" && method === "CARD" ? (
            <ReaderButtons
              stripe={Boolean(terminal)}
              square={Boolean(squareTerminal?.devices.length)}
              onPick={setReaderMode}
              quiet
            />
          ) : null}

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
            <SubmitButton pendingLabel="Recording…">
              {method === "CARD" ? "Approved — record payment" : "Record payment"}
            </SubmitButton>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The method as big tiles instead of a drop-down: one tap, every choice in
 * view, the chosen one filled. Same five methods, same `method` field in the
 * form (the hidden input below carries it), same state in the dialog; only the
 * control that sets it changed. Left and right arrows move the choice, like any
 * radio group.
 */
const METHOD_ICONS = {
  CARD: ICONS.payment,
  CASH: ICONS.cash,
  CHECK: ICONS.payout,
  CREDIT: ICONS.credit,
  OTHER: ACTIONS.more,
} as const;

export function MethodTiles({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = METHODS[(index + step + METHODS.length) % METHODS.length];
    onChange(next.value);
    const group = event.currentTarget.parentElement;
    window.requestAnimationFrame(() => group?.querySelector<HTMLButtonElement>(`[data-method="${next.value}"]`)?.focus());
  };

  return (
    <>
      <input type="hidden" name="method" value={value} />
      <div role="radiogroup" aria-labelledby="method-label" className="flex flex-wrap gap-2">
        {METHODS.map((m, index) => {
          const Icon = METHOD_ICONS[m.value];
          const checked = m.value === value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              data-method={m.value}
              onClick={() => onChange(m.value)}
              onKeyDown={(event) => move(event, index)}
              className={cn(
                "flex min-h-14 flex-1 basis-[6rem] sm:basis-[7rem] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-[14px] font-semibold leading-tight transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5 [&_svg]:shrink-0",
                checked
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border-strong bg-surface text-foreground hover:bg-surface-hover",
              )}
            >
              <Icon aria-hidden />
              {m.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Same two controls as the register's tender dialog; see its notes. */
function ReaderButtons({
  stripe,
  square,
  onPick,
  quiet = false,
}: {
  stripe: boolean;
  square: boolean;
  onPick: (reader: "stripe" | "square") => void;
  quiet?: boolean;
}) {
  if (!stripe && !square) return null;
  const options = [
    stripe ? ({ id: "stripe", label: "Stripe Terminal" } as const) : null,
    square ? ({ id: "square", label: "Square Terminal" } as const) : null,
  ].filter((option) => option !== null);

  return (
    <div className={quiet ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-2"}>
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={quiet ? "outline" : "soft"}
          size="lg"
          className={quiet ? "h-11 flex-1 text-[13.5px]" : "h-13"}
          onClick={() => onPick(option.id)}
        >
          <ACTIONS.pay />
          {quiet ? `Send to ${option.label} instead` : `Send it to ${option.label}`}
        </Button>
      ))}
    </div>
  );
}

/** The customer is waiting with a card out: offer the way through, not a diagnosis. */
function MachineTroubleNote({ onManual }: { onManual: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Machine not working?</span>{" "}
        Take the card on any machine you have, then record it here. Nothing was
        charged by Repairs helper.
      </p>
      <Button type="button" size="lg" className="w-full" onClick={onManual}>
        Record it manually
      </Button>
    </div>
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
  const [failed, setFailed] = React.useState(false);
  const alive = React.useRef(true);

  React.useEffect(() => () => {
    alive.current = false;
  }, []);

  const start = async () => {
    if (!deviceId) return;
    setBusy(true);
    setFailed(false);
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
      setFailed(true);
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
      {failed && !busy && !approved ? <MachineTroubleNote onManual={onKeyIn} /> : null}
      <DialogFooter>
        {approved ? (
          <Button type="button" onClick={onDone}>Done</Button>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={onKeyIn}>Record it manually instead</Button>
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

      {!reader.busy && reader.step !== "approved" && (reader.error || reader.unavailable) ? (
        <MachineTroubleNote onManual={onKeyIn} />
      ) : null}

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
              Record it manually instead
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
