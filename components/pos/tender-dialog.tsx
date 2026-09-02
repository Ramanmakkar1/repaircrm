"use client";

import * as React from "react";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { TerminalPanel } from "@/components/payments/terminal-panel";
import { useStripeTerminal } from "@/components/payments/use-stripe-terminal";
import { formatCents, parseCents } from "@/lib/money";
import { METHOD_LABELS, type TenderMethod } from "./types";

/** Bills a counter actually gets handed. */
const QUICK_BILLS = [2000, 5000, 10000];

export type TenderConfirm = {
  reference: string | null;
  tenderedCents: number | null;
};

/**
 * Everything the card-machine path needs, or absent when this shop has no
 * machine — in which case the option is not rendered at all rather than
 * rendered disabled. A greyed-out "Card machine" button on a counter that has
 * never owned one is an advert, not a control.
 */
export type TenderTerminal = {
  /** Discovers a PRACTICE machine. Server-derived boolean; no key crosses over. */
  testMode: boolean;
  /** Opens a card-present PaymentIntent for the server-priced cart. */
  createIntent: () => Promise<
    | { ok: true; clientSecret: string | null; paymentIntentId: string }
    | { ok: false; error: string }
  >;
  /** Rings the sale up once Stripe approves. */
  record: (paymentIntentId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * The tender step — the last thing between a full cart and a finished sale.
 *
 * Cash gets the whole treatment (amount received, one-tap bills, change due in
 * the largest type on the screen) because that is the tender that needs
 * arithmetic done under time pressure. Every other method only ever needs an
 * optional reference, so it gets one field and a confirm button.
 *
 * The form is a separate component mounted only while the dialog is open and
 * keyed by method, so each tender starts from a clean slate by construction —
 * a stale amount left over from the previous customer is the one thing a
 * register must never do, and a remount guarantees that without a reset effect.
 */
export function TenderDialog({
  method,
  totalCents,
  customerCredit,
  customerName,
  pending,
  error,
  terminal,
  onClose,
  onConfirm,
}: {
  method: TenderMethod | null;
  totalCents: number;
  customerCredit: number;
  customerName: string;
  pending: boolean;
  error: string | null;
  /** Absent when this shop cannot take a card at a reader. */
  terminal?: TenderTerminal;
  onClose: () => void;
  onConfirm: (input: TenderConfirm) => void;
}) {
  return (
    <Dialog
      open={method !== null}
      onOpenChange={(next) => {
        // A sale in flight must not be dismissed out from under itself.
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{method ? METHOD_LABELS[method] : ""} payment</DialogTitle>
          <DialogDescription>
            {formatCents(totalCents)} from {customerName}.
          </DialogDescription>
        </DialogHeader>

        {method ? (
          <TenderForm
            key={method}
            method={method}
            totalCents={totalCents}
            customerCredit={customerCredit}
            pending={pending}
            error={error}
            terminal={terminal}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TenderForm({
  method,
  totalCents,
  customerCredit,
  pending,
  error,
  terminal,
  onClose,
  onConfirm,
}: {
  method: TenderMethod;
  totalCents: number;
  customerCredit: number;
  pending: boolean;
  error: string | null;
  terminal?: TenderTerminal;
  onClose: () => void;
  onConfirm: (input: TenderConfirm) => void;
}) {
  const isCash = method === "CASH";
  // A card can be keyed in (the cashier ran it on a separate machine and types
  // the auth code) or taken on a machine wired to this shop's Stripe account.
  // Only the second one moves money from in here, so the two are separate
  // choices rather than one button that does different things.
  const canUseReader = method === "CARD" && Boolean(terminal);
  const [useReader, setUseReader] = React.useState(false);
  // Opening on the exact amount makes the overwhelmingly common "card, done"
  // and "exact change" paths a single click.
  const [received, setReceived] = React.useState(() =>
    (Math.max(totalCents, 0) / 100).toFixed(2),
  );
  const [reference, setReference] = React.useState("");

  const receivedCents = isCash ? parseCents(received) : 0;
  const changeDueCents = receivedCents - totalCents;
  const short = isCash && changeDueCents < 0;
  const creditShort = method === "CREDIT" && customerCredit < totalCents;
  const blocked = pending || short || creditShort;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    onConfirm({
      reference: reference.trim() || null,
      tenderedCents: isCash ? receivedCents : null,
    });
  };

  if (canUseReader && useReader && terminal) {
    return (
      <ReaderTender
        totalCents={totalCents}
        terminal={terminal}
        error={error}
        onKeyIn={() => setUseReader(false)}
        onClose={onClose}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {canUseReader ? (
        <Button
          type="button"
          variant="soft"
          size="lg"
          className="h-14 text-[15px]"
          onClick={() => setUseReader(true)}
        >
          <CreditCard /> Take it on the card machine
        </Button>
      ) : null}

      {isCash ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="received">Amount received</Label>
            <Input
              id="received"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
              inputMode="decimal"
              autoFocus
              className="h-16 text-right text-3xl font-bold tabular-nums"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <QuickAmount
              label="Exact"
              onClick={() => setReceived((totalCents / 100).toFixed(2))}
            />
            {QUICK_BILLS.map((cents) => (
              <QuickAmount
                key={cents}
                label={formatCents(cents).replace(".00", "")}
                // A bill smaller than the total cannot settle it on its own.
                disabled={cents < totalCents}
                onClick={() => setReceived((cents / 100).toFixed(2))}
              />
            ))}
          </div>

          <div
            className={cn(
              "flex items-baseline justify-between gap-4 rounded-lg px-5 py-4",
              short
                ? "bg-destructive-soft text-destructive"
                : "bg-status-resolved-bg text-status-resolved-fg",
            )}
          >
            <span className="text-[15px] font-bold">
              {short ? "Still owing" : "Change due"}
            </span>
            <span className="text-4xl font-bold tabular-nums tracking-tight">
              {formatCents(Math.abs(changeDueCents))}
            </span>
          </div>
        </>
      ) : method === "CREDIT" ? (
        <p
          className={cn(
            "rounded-md px-4 py-3 text-[14px] font-medium",
            creditShort
              ? "bg-destructive-soft text-destructive"
              : "bg-surface-hover text-muted-foreground",
          )}
        >
          Store credit available: {formatCents(customerCredit)}
          {creditShort
            ? ` — short of the ${formatCents(totalCents)} total.`
            : ` · ${formatCents(customerCredit - totalCents)} left after this sale.`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="reference">Reference (optional)</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Check #, auth code, last 4…"
            className="h-12"
            autoFocus
            maxLength={200}
          />
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={blocked}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Finishing…
            </>
          ) : (
            `Take ${formatCents(totalCents)}`
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function QuickAmount({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-12 rounded-md border border-border-strong bg-surface text-[14px] font-bold tabular-nums text-foreground transition-colors",
        "hover:border-accent/40 hover:bg-surface-hover",
        "disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      {label}
    </button>
  );
}

/**
 * The card-machine tender.
 *
 * The sale is NOT rung up first: the card is presented, Stripe approves, and
 * only then does `terminal.record` write the invoice and its payment. A
 * declined card therefore leaves nothing behind — no half-invoice, no stock
 * movement — and the cashier can hand it back and try another tender.
 */
function ReaderTender({
  totalCents,
  terminal,
  error,
  onKeyIn,
  onClose,
}: {
  totalCents: number;
  terminal: TenderTerminal;
  error: string | null;
  onKeyIn: () => void;
  onClose: () => void;
}) {
  const reader = useStripeTerminal(terminal.testMode);

  const start = () => {
    void reader.collect({
      createIntent: terminal.createIntent,
      record: terminal.record,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <TerminalPanel
        amountCents={totalCents}
        terminal={reader}
        onStart={start}
        startLabel={`Charge ${formatCents(totalCents)}`}
      />

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={reader.busy}
          onClick={onKeyIn}
        >
          Key it in instead
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={reader.busy}
          onClick={onClose}
        >
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}
