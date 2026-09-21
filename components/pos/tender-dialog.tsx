"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { TerminalPanel } from "@/components/payments/terminal-panel";
import { useStripeTerminal } from "@/components/payments/use-stripe-terminal";
import { formatCents, parseCents } from "@/lib/money";
import type { CardFlow } from "@/lib/payments/card-machine";
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

export type TenderSquareTerminal = {
  devices: { id: string; name: string; status: string }[];
  createCheckout: (deviceId: string) => Promise<
    | { ok: true; checkoutId: string }
    | { ok: false; error: string }
  >;
  record: (checkoutId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  squareTerminal,
  cardFlow = "manual",
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
  squareTerminal?: TenderSquareTerminal;
  /**
   * What Card opens on, already resolved against what is paired (see
   * lib/payments/card-machine.ts). "manual" when the shop keys the amount into
   * its own machine — or has no machine wired to RepairPilot at all.
   */
  cardFlow?: CardFlow;
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
            squareTerminal={squareTerminal}
            cardFlow={cardFlow}
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
  squareTerminal,
  cardFlow,
  onClose,
  onConfirm,
}: {
  method: TenderMethod;
  totalCents: number;
  customerCredit: number;
  pending: boolean;
  error: string | null;
  terminal?: TenderTerminal;
  squareTerminal?: TenderSquareTerminal;
  cardFlow: CardFlow;
  onClose: () => void;
  onConfirm: (input: TenderConfirm) => void;
}) {
  const isCash = method === "CASH";
  // A card can be keyed in (the cashier ran it on a separate machine and types
  // the auth code) or taken on a machine wired to this shop's Stripe account.
  // Only the second one moves money from in here, so the two are separate
  // choices rather than one button that does different things.
  const canUseReader = method === "CARD" && Boolean(terminal || squareTerminal);
  // An "automatic" shop lands on its machine with the amount already on the
  // way — Card, tap, done. The form is remounted per tender (keyed by method),
  // so this initial value is re-decided for every sale.
  const [useReader, setUseReader] = React.useState<"stripe" | "square" | null>(() =>
    method !== "CARD"
      ? null
      : cardFlow === "stripe" && terminal
        ? "stripe"
        : cardFlow === "square" && squareTerminal
          ? "square"
          : null,
  );
  const isCard = method === "CARD";
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

  if (canUseReader && useReader === "stripe" && terminal) {
    return (
      <ReaderTender
        totalCents={totalCents}
        terminal={terminal}
        error={error}
        onKeyIn={() => setUseReader(null)}
        onClose={onClose}
      />
    );
  }

  if (canUseReader && useReader === "square" && squareTerminal) {
    return (
      <SquareReaderTender
        totalCents={totalCents}
        terminal={squareTerminal}
        error={error}
        onKeyIn={() => setUseReader(null)}
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

      {isCard && cardFlow !== "manual" ? (
        <ReaderButtons
          terminal={terminal}
          squareTerminal={squareTerminal}
          onPick={setUseReader}
        />
      ) : null}

      {isCard ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-5 py-6 text-center">
          <span className="text-[13.5px] font-semibold text-muted-foreground">
            Key this amount into your card machine
          </span>
          <span className="text-4xl font-bold leading-none tabular-nums tracking-tight text-foreground">
            {formatCents(totalCents)}
          </span>
          <span className="text-[13.5px] text-muted-foreground">
            When the machine says approved, press the button below.
          </span>
        </div>
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
          <Label htmlFor="reference">
            {isCard ? "Last 4 digits or approval code (optional)" : "Reference (optional)"}
          </Label>
          <Input
            id="reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder={isCard ? "e.g. 4242" : "Check #, reference…"}
            className="h-12"
            // A card sale is usually just "Approved": leave the focus on the
            // confirm button so Enter finishes it, and nobody has to tab past
            // a field they were never going to fill.
            autoFocus={!isCard}
            maxLength={200}
          />
        </div>
      )}

      {isCard && cardFlow === "manual" ? (
        <ReaderButtons
          terminal={terminal}
          squareTerminal={squareTerminal}
          onPick={setUseReader}
          quiet
        />
      ) : null}

      {/* Stacked on a phone, with the confirm on top under the thumb: at
          390px two full-size buttons side by side put "Take $1,284.50" one
          careless tap away from "Cancel". */}
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={blocked}
          autoFocus={isCard}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Finishing…
            </>
          ) : isCard ? (
            `Approved — finish ${formatCents(totalCents)}`
          ) : (
            `Take ${formatCents(totalCents)}`
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The way across to a connected machine from the manual screen, and the
 * chooser when a shop has paired both kinds and asked to be asked.
 *
 * `quiet` is the manual-mode shop: the owner said "we key it in", so the
 * connected machine is one small line under the form, not the first thing the
 * cashier sees on every sale.
 */
function ReaderButtons({
  terminal,
  squareTerminal,
  onPick,
  quiet = false,
}: {
  terminal?: TenderTerminal;
  squareTerminal?: TenderSquareTerminal;
  onPick: (reader: "stripe" | "square") => void;
  quiet?: boolean;
}) {
  if (!terminal && !squareTerminal) return null;
  const options = [
    terminal ? ({ id: "stripe", label: "Stripe Terminal" } as const) : null,
    squareTerminal ? ({ id: "square", label: "Square Terminal" } as const) : null,
  ].filter((option) => option !== null);

  return (
    <div className={cn("flex flex-col gap-2", quiet && "sm:flex-row")}>
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={quiet ? "outline" : "soft"}
          size="lg"
          className={cn(quiet ? "h-11 flex-1 text-[13.5px]" : "h-14 text-[15px]")}
          onClick={() => onPick(option.id)}
        >
          <ACTIONS.pay />
          {quiet ? `Send to ${option.label} instead` : `Send it to ${option.label}`}
        </Button>
      ))}
    </div>
  );
}

/**
 * Shown the moment a connected machine lets the cashier down. The customer is
 * standing there with a card out: the fix that matters is "use any machine and
 * carry on", not a diagnosis.
 */
function MachineTroubleNote({ onManual }: { onManual: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Machine not working?</span>{" "}
        Take the card on any machine you have, then record it here. Nothing was
        charged by RepairPilot.
      </p>
      <Button type="button" size="lg" className="w-full" onClick={onManual}>
        Record it manually
      </Button>
    </div>
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

      {!reader.busy && (reader.error || reader.unavailable) ? (
        <MachineTroubleNote onManual={onKeyIn} />
      ) : null}

      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          disabled={reader.busy}
          onClick={onKeyIn}
        >
          Record it manually instead
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          disabled={reader.busy}
          onClick={onClose}
        >
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}

function SquareReaderTender({
  totalCents,
  terminal,
  error,
  onKeyIn,
  onClose,
}: {
  totalCents: number;
  terminal: TenderSquareTerminal;
  error: string | null;
  onKeyIn: () => void;
  onClose: () => void;
}) {
  const [deviceId, setDeviceId] = React.useState(terminal.devices[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("Ready when you are.");
  const [failed, setFailed] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);

  const start = async () => {
    setBusy(true);
    setFailed(false);
    setMessage("Sending the sale to Square Terminal…");
    try {
      const created = await terminal.createCheckout(deviceId);
      if (!created.ok) throw new Error(created.error);
      setMessage("Present card on Square Terminal…");
      for (let attempt = 0; attempt < 150 && alive.current; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const response = await fetch(`/api/payments/square/terminal/pos-status?id=${encodeURIComponent(created.checkoutId)}`, { cache: "no-store" });
        const status = await response.json().catch(() => null) as { status?: string; error?: string } | null;
        if (!response.ok) throw new Error(status?.error ?? "Could not verify the Square payment.");
        if (status?.status === "canceled") throw new Error("Square Terminal canceled the payment.");
        if (status?.status === "completed") {
          setMessage("Approved — finishing the sale…");
          const recorded = await terminal.record(created.checkoutId);
          if (!recorded.ok) throw new Error(recorded.error);
          setBusy(false);
          return;
        }
      }
      throw new Error("Square Terminal did not finish in time. Check the invoice list before retrying.");
    } catch (problem) {
      if (!alive.current) return;
      setMessage(problem instanceof Error ? problem.message : "Square Terminal could not finish the payment.");
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">{error}</div>
      ) : null}
      <div className="rounded-lg border border-border bg-surface-hover p-4">
        <p className="text-sm font-semibold text-foreground">Square Terminal</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        {terminal.devices.length > 1 && !busy ? (
          <div className="mt-4">
            <Label htmlFor="pos-square-device">Machine</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger id="pos-square-device" className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {terminal.devices.map((device) => <SelectItem key={device.id} value={device.id}>{device.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button type="button" size="lg" className="mt-4 w-full" disabled={busy || !deviceId} onClick={() => void start()}>
          {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.pay />}
          {busy ? "Waiting for customer…" : failed ? `Try again — ${formatCents(totalCents)}` : `Charge ${formatCents(totalCents)}`}
        </Button>
      </div>
      {failed && !busy ? <MachineTroubleNote onManual={onKeyIn} /> : null}
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2.5">
        <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onKeyIn}>Record it manually instead</Button>
        <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onClose}>Cancel</Button>
      </DialogFooter>
    </div>
  );
}
