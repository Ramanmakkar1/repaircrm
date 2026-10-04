/**
 * What the 80mm counter receipt prints below the TOTAL, decided from stored
 * rows so a reprint a week later says exactly what the first copy said.
 *
 * Pure: no `db`, no React. The money comes from `refundAwareTotals`, the same
 * helper the invoice screen, the printed invoice and the statement use, so the
 * slip can never say "paid" while the screen says "owing".
 */

import { formatCents, parseCents } from "@/lib/money";
import { refundAwareTotals, type RefundLike } from "./refund-math";
import type { LineLike } from "@/lib/money";

/**
 * The register writes what a cash customer handed over into the payment's
 * reference ("Tendered $50.00", app/(app)/pos/checkout.ts buildReference), and
 * Take payment on an invoice does the same. Null for anything else.
 */
export function tenderedFromReference(reference: string | null | undefined): number | null {
  const match = /^Tendered \$([\d,]+(?:\.\d{1,2})?)$/.exec((reference ?? "").trim());
  if (!match) return null;
  const cents = parseCents(match[1]);
  return cents > 0 ? cents : null;
}

/** The reference a cash payment stores when more was handed over than was taken. */
export function tenderedReference(tenderedCents: number, amountCents: number): string | null {
  if (!Number.isFinite(tenderedCents) || tenderedCents <= amountCents) return null;
  // Exactly the register's wording, so one parser reads both.
  return `Tendered ${formatCents(tenderedCents)}`;
}

export type ReceiptPayment = {
  amountCents: number;
  method: string;
  reference: string | null;
};

export type ReceiptRefund = RefundLike & { method: string; createdAt?: Date };

export type ReceiptSummary = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  /** Money handed back, failed card refunds left out. */
  refundedCents: number;
  /** What is still owed after refunds; never below zero on the slip. */
  balanceCents: number;
  /** What the customer handed over in cash, when the register recorded it. */
  tenderedCents: number | null;
  /** Change that came out of the drawer, or null when there was none to give. */
  changeCents: number | null;
};

/**
 * The slip's figures. `changeFromQuery` is the change the register passed on
 * the first print (`?change=`); a reprint has none, so the change is worked out
 * from the stored "Tendered $X" on the cash payments instead.
 */
export function receiptSummary(input: {
  lines: readonly LineLike[];
  taxRateBps: number;
  payments: readonly ReceiptPayment[];
  refunds: readonly RefundLike[];
  changeFromQuery?: number | null;
}): ReceiptSummary {
  const totals = refundAwareTotals(input.lines, input.taxRateBps, input.payments, input.refunds);

  let tenderedCents: number | null = null;
  let storedChange = 0;
  for (const payment of input.payments) {
    if (payment.method !== "CASH") continue;
    const tendered = tenderedFromReference(payment.reference);
    if (tendered === null) continue;
    tenderedCents = (tenderedCents ?? 0) + tendered;
    storedChange += Math.max(0, tendered - payment.amountCents);
  }

  const changeCents =
    input.changeFromQuery !== null && input.changeFromQuery !== undefined
      ? input.changeFromQuery
      : storedChange > 0
        ? storedChange
        : null;

  return {
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    paidCents: totals.paidCents,
    refundedCents: totals.refundedCents,
    balanceCents: Math.max(0, totals.balanceCents),
    tenderedCents,
    changeCents,
  };
}
