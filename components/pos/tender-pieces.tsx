"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { formatCents, parseCents } from "@/lib/money";

/**
 * The register's tender pieces, shared.
 *
 * The Sell screen's tender dialog (./tender-dialog.tsx) and Take payment on an
 * invoice (components/billing/payment-dialog.tsx) are the same job at the same
 * counter, so they use the same pieces: the one-tap bills, the "Cash handed
 * over" field and the change due in the biggest type on the screen. Change is
 * worked out by `cashChange`, which is pure and tested.
 */

/** Bills a counter actually gets handed. */
export const QUICK_BILLS = [2000, 5000, 10000] as const;

export type CashChange = {
  /** What was handed over, in cents (0 for anything unreadable). */
  receivedCents: number;
  /** Received minus due. Negative while the customer is still short. */
  changeCents: number;
  /** Not enough handed over yet. */
  short: boolean;
};

/** Change for a cash tender: never a float, never a guess. */
export function cashChange(received: string | number, dueCents: number): CashChange {
  const receivedCents = typeof received === "number" ? Math.round(received) : parseCents(received);
  const changeCents = receivedCents - Math.round(dueCents);
  return { receivedCents, changeCents, short: changeCents < 0 };
}

/** The bills worth offering for an amount: a bill smaller than what is due cannot settle it alone. */
export function quickBillsFor(dueCents: number): { cents: number; disabled: boolean }[] {
  return QUICK_BILLS.map((cents) => ({ cents, disabled: cents < dueCents }));
}

/** "$20" for a whole-dollar bill. */
export function billLabel(cents: number): string {
  return formatCents(cents).replace(/\.00$/, "");
}

/** One big chip that fills in an amount. 48px tall. */
export function QuickAmount({
  label,
  onClick,
  disabled,
  pressed,
  className,
}: {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Filled when this chip is the amount on screen. */
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "min-h-12 rounded-md border px-2 text-[14px] font-bold tabular-nums transition-colors",
        pressed
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border-strong bg-surface text-foreground hover:border-accent/40 hover:bg-surface-hover",
        "disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      {label}
    </button>
  );
}

/**
 * Cash: what was handed over, the one-tap bills, and the change due (or what
 * is still owing) in the largest type on the screen. Controlled: the dialog
 * owns the text so it can post it.
 */
export function CashTender({
  dueCents,
  received,
  onReceived,
  id = "received",
  autoFocus = true,
}: {
  dueCents: number;
  received: string;
  onReceived: (next: string) => void;
  id?: string;
  autoFocus?: boolean;
}) {
  const { changeCents, short } = cashChange(received, dueCents);
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Cash handed over</Label>
        <Input
          id={id}
          value={received}
          onChange={(event) => onReceived(event.target.value)}
          inputMode="decimal"
          autoFocus={autoFocus}
          className="h-16 text-right text-3xl font-bold tabular-nums"
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <QuickAmount label="Exact" onClick={() => onReceived((Math.max(dueCents, 0) / 100).toFixed(2))} />
        {quickBillsFor(dueCents).map((bill) => (
          <QuickAmount
            key={bill.cents}
            label={billLabel(bill.cents)}
            disabled={bill.disabled}
            onClick={() => onReceived((bill.cents / 100).toFixed(2))}
          />
        ))}
      </div>

      <div
        role="status"
        className={cn(
          "flex items-baseline justify-between gap-4 rounded-lg px-5 py-4",
          short ? "bg-destructive-soft text-destructive" : "bg-status-resolved-bg text-status-resolved-fg",
        )}
      >
        <span className="text-[15px] font-bold">{short ? "Still owing" : "Change due"}</span>
        <span className="text-4xl font-bold tabular-nums tracking-tight">{formatCents(Math.abs(changeCents))}</span>
      </div>
    </>
  );
}
