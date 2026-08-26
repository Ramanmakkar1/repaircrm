/**
 * Money helpers.
 *
 * INVARIANT: money is an integer number of cents everywhere — in the database,
 * in props, in form values. Floats never touch a currency amount. Tax rates are
 * integer basis points (825 = 8.25%).
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 -> "$1,234.56" ; -500 -> "-$5.00" */
export function formatCents(cents: number | null | undefined): string {
  const value = Math.round(Number(cents ?? 0));
  return USD.format(value / 100);
}

/** 825 -> "8.25%" */
export function formatBps(bps: number | null | undefined): string {
  const value = Number(bps ?? 0) / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

/** "8.25" | "8.25%" -> 825. Returns 0 for unparseable input. */
export function parseBps(input: string | number | null | undefined): number {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = String(input ?? "").replace(/[^0-9.\-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** "$1,234.56" | "1234.56" -> 123456. Returns 0 for unparseable input. */
export function parseCents(input: string | number | null | undefined): number {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = String(input ?? "").replace(/[^0-9.\-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** The shape every line item (estimate, invoice, ticket charge) shares. */
export type LineLike = {
  quantity: number;
  unitPriceCents: number;
  taxable?: boolean | null;
};

export type Totals = {
  subtotalCents: number;
  /** Portion of the subtotal that tax was applied to. */
  taxableSubtotalCents: number;
  taxCents: number;
  totalCents: number;
};

/**
 * Sums lines and applies `taxRateBps` to the taxable portion only.
 * Tax is rounded once, on the taxable subtotal — not per line — which is what
 * accounting expects and avoids penny drift on multi-line documents.
 */
export function calcTotals(
  lines: readonly LineLike[],
  taxRateBps: number = 0
): Totals {
  let subtotalCents = 0;
  let taxableSubtotalCents = 0;

  for (const line of lines) {
    const qty = Math.round(Number(line.quantity) || 0);
    const unit = Math.round(Number(line.unitPriceCents) || 0);
    const amount = qty * unit;
    subtotalCents += amount;
    if (line.taxable) taxableSubtotalCents += amount;
  }

  const bps = Math.round(Number(taxRateBps) || 0);
  const taxCents = Math.round((taxableSubtotalCents * bps) / 10_000);

  return {
    subtotalCents,
    taxableSubtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

/** Sum of payment amounts, in cents. */
export function sumPayments(
  payments: readonly { amountCents: number }[]
): number {
  return payments.reduce((sum, p) => sum + (Math.round(p.amountCents) || 0), 0);
}

/**
 * Totals plus payment state for an invoice.
 * `balanceCents` is what the customer still owes (negative = overpaid).
 */
export function invoiceTotals(
  lines: readonly LineLike[],
  taxRateBps: number,
  payments: readonly { amountCents: number }[] = []
): Totals & { paidCents: number; balanceCents: number } {
  const totals = calcTotals(lines, taxRateBps);
  const paidCents = sumPayments(payments);
  return {
    ...totals,
    paidCents,
    balanceCents: totals.totalCents - paidCents,
  };
}
