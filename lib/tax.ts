import { formatBps } from "@/lib/money";

/**
 * Sales-tax resolution.
 *
 * A shop can keep several named rates (`TaxRate`) — "GST 5%", "GST + PST 12%",
 * "Out of state 0%" — and a customer can be pinned to one of them or marked
 * exempt entirely. `Shop.taxRateBps` stays the single default, kept in sync
 * with whichever rate wears the star, so every screen written before this
 * module existed keeps working unchanged.
 *
 * Pure on purpose: imported by server actions, print sheets AND the client-side
 * editors, so no `db`, no `next/*`, no "use server".
 *
 * DOCUMENTS SNAPSHOT, THEY DO NOT FOLLOW. Estimates, invoices and recurring
 * schedules each store `taxRateBps` (the number the customer was shown) as well
 * as `taxRateId` (which rate it came from). Renaming or re-pricing a TaxRate
 * later never restates a document that has already been issued — the id is
 * provenance, the bps is the fact.
 */

/** A tax rate as every caller needs it. */
export type TaxRateOption = {
  id: string;
  name: string;
  rateBps: number;
  isDefault: boolean;
  active: boolean;
};

export type ResolvedTax = {
  /** Null when no named rate applies — exempt, or a shop with no rates yet. */
  taxRateId: string | null;
  taxRateBps: number;
  /** Display name, or null when the rate has no row behind it. */
  name: string | null;
};

/** The `Radix Select` sentinel for "no tax" — an empty value is not allowed. */
export const NO_TAX = "none";

/**
 * Which rate a new document for this customer should open on.
 *
 *   exempt customer      -> 0%, no rate
 *   customer's own rate  -> that rate (even if it has since been deactivated —
 *                           it is still what this customer is charged)
 *   otherwise            -> the shop's default rate, or its plain `taxRateBps`
 */
export function resolveTaxRate({
  shop,
  customer,
}: {
  shop: { taxRateBps: number; taxRates?: readonly TaxRateOption[] | null };
  customer?: {
    taxExempt?: boolean | null;
    taxRateId?: string | null;
  } | null;
}): ResolvedTax {
  if (customer?.taxExempt) {
    return { taxRateId: null, taxRateBps: 0, name: null };
  }

  const rates = shop.taxRates ?? [];

  if (customer?.taxRateId) {
    const own = rates.find((rate) => rate.id === customer.taxRateId);
    if (own) {
      return { taxRateId: own.id, taxRateBps: own.rateBps, name: own.name };
    }
  }

  const fallback = defaultTaxRate(rates);
  if (fallback) {
    return {
      taxRateId: fallback.id,
      taxRateBps: fallback.rateBps,
      name: fallback.name,
    };
  }

  return { taxRateId: null, taxRateBps: shop.taxRateBps, name: null };
}

/** The starred rate, or the first active one when nothing is starred. */
export function defaultTaxRate(
  rates: readonly TaxRateOption[],
): TaxRateOption | null {
  return (
    rates.find((rate) => rate.isDefault && rate.active) ??
    rates.find((rate) => rate.active) ??
    null
  );
}

/**
 * The label printed next to a tax line: "GST 5%" when the rate has a name,
 * "Tax (5%)" when it is just the shop's number.
 */
export function taxLabel(
  name: string | null | undefined,
  bps: number,
): string {
  return name ? `${name} ${formatBps(bps)}` : `Tax (${formatBps(bps)})`;
}
