/**
 * REFUND-AWARE INVOICE MATH.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT IN lib/money.ts
 * ---------------------------------------------------------------------------
 * `invoiceTotals()` in lib/money.ts knows about lines, tax and payments, and
 * nothing else. It is shared by estimates, recurring invoices, the portal, the
 * public API and the print sheets, so widening its signature to carry refunds
 * would force a fourth argument on every one of those callers for a concept
 * most of them have no opinion about. Refunds are a billing-module concern, so
 * the refund-aware layer lives here, in the billing module, and *wraps* the
 * shared primitive rather than replacing it.
 *
 * Everything that needs refund-aware numbers imports from this file:
 *   · app/(app)/invoices/[id]/page.tsx   — the balance card + refunds table
 *   · app/(app)/invoices/actions.ts      — refundInvoiceAction's validation
 *                                          and the status it recomputes
 *
 * ---------------------------------------------------------------------------
 * THE MATH
 * ---------------------------------------------------------------------------
 *   paid        = Σ payments                     (append-only; never edited)
 *   refunded    = Σ refunds                      (append-only; never edited)
 *   netPaid     = paid − refunded                (what the shop actually kept)
 *   balance     = total − netPaid                (what the customer still owes)
 *   refundable  = paid − refunded                (never more than came in)
 *
 * `netPaid` and `refundable` are the same subtraction seen from two directions,
 * and both are named because the call sites mean different things by it.
 *
 * A Payment row is NEVER deleted or amended to represent a refund. The money
 * came in, then some went back out; both facts stay on the record, which is
 * what makes a till reconcilable and a chargeback arguable.
 */

import { calcTotals, sumPayments, type LineLike, type Totals } from "@/lib/money";

export type RefundLike = {
  amountCents: number;
  /**
   * "completed" | "pending" | "failed". Optional: rows recorded by hand carry
   * "completed" by default and callers that never had a Stripe refund can omit
   * it entirely.
   */
  status?: string | null;
};

/**
 * Sum of refund amounts, in cents. Mirrors `sumPayments`.
 *
 * FAILED REFUNDS DO NOT COUNT. A Stripe refund that the API rejected is money
 * that never left — the row survives as an audit trail of the attempt, but
 * counting it would tell the customer they had been paid back when they had
 * not. A PENDING refund does count: the shop has instructed Stripe to send it,
 * and reporting a balance that is about to be wrong in the customer's favour
 * is the safer of the two errors.
 */
export function sumRefunds(refunds: readonly RefundLike[]): number {
  return refunds.reduce(
    (sum, r) => (r.status === "failed" ? sum : sum + (Math.round(r.amountCents) || 0)),
    0,
  );
}

/**
 * How much of this invoice can still be handed back.
 *
 * Clamped at zero so an over-refunded invoice (only reachable by a direct
 * database edit) reports "nothing left" rather than a negative ceiling that
 * would read as a credit.
 */
export function refundableCents(
  payments: readonly { amountCents: number }[],
  refunds: readonly RefundLike[],
): number {
  return Math.max(0, sumPayments(payments) - sumRefunds(refunds));
}

export type RefundAwareTotals = Totals & {
  paidCents: number;
  refundedCents: number;
  /** paid − refunded: the money the shop is actually still holding. */
  netPaidCents: number;
  /** total − netPaid. Negative means the customer overpaid. */
  balanceCents: number;
  /** What a further refund is capped at. */
  refundableCents: number;
};

export function refundAwareTotals(
  lines: readonly LineLike[],
  taxRateBps: number,
  payments: readonly { amountCents: number }[] = [],
  refunds: readonly RefundLike[] = [],
): RefundAwareTotals {
  const totals = calcTotals(lines, taxRateBps);
  const paidCents = sumPayments(payments);
  const refundedCents = sumRefunds(refunds);
  const netPaidCents = paidCents - refundedCents;

  return {
    ...totals,
    paidCents,
    refundedCents,
    netPaidCents,
    balanceCents: totals.totalCents - netPaidCents,
    refundableCents: Math.max(0, netPaidCents),
  };
}

/**
 * The invoice status implied by a given net-paid position.
 *
 * Refunding money back out of a settled invoice must walk the status backwards,
 * otherwise a PAID badge would sit on top of an invoice the shop no longer
 * holds the money for.
 *
 *   netPaid <= 0            → SENT      (nothing is held; it is owed again)
 *   0 < netPaid < total     → PARTIAL
 *   netPaid >= total        → PAID
 *
 * VOID is left alone — a void invoice has no receivable to restate. DRAFT never
 * reaches here because a draft has no payments to refund.
 */
export function statusForNetPaid(
  netPaidCents: number,
  totalCents: number,
): "SENT" | "PARTIAL" | "PAID" {
  if (netPaidCents <= 0) return "SENT";
  if (netPaidCents < totalCents) return "PARTIAL";
  return "PAID";
}
