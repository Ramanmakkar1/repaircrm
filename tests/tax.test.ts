import { describe, expect, it } from "vitest";

import { calcTotals } from "@/lib/money";
import {
  defaultTaxRate,
  NO_TAX,
  resolveTaxRate,
  taxLabel,
  type TaxRateOption,
} from "@/lib/tax";

/**
 * lib/tax.ts — which rate a document opens on, and the promise that a document
 * already issued never changes its mind about it.
 */

const rate = (over: Partial<TaxRateOption> = {}): TaxRateOption => ({
  id: "rate_gst",
  name: "GST 5%",
  rateBps: 500,
  isDefault: false,
  active: true,
  ...over,
});

const GST = rate();
const GST_PST = rate({ id: "rate_both", name: "GST + PST 12%", rateBps: 1200 });
const OUT_OF_STATE = rate({
  id: "rate_none",
  name: "Out of state 0%",
  rateBps: 0,
});

describe("resolveTaxRate", () => {
  it("charges the shop's plain rate when the shop has no named rates", () => {
    expect(resolveTaxRate({ shop: { taxRateBps: 825 } })).toEqual({
      taxRateId: null,
      taxRateBps: 825,
      name: null,
    });
  });

  it("prefers the starred rate over the shop's plain number", () => {
    const resolved = resolveTaxRate({
      shop: {
        taxRateBps: 825,
        taxRates: [GST, { ...GST_PST, isDefault: true }],
      },
    });

    expect(resolved).toEqual({
      taxRateId: "rate_both",
      taxRateBps: 1200,
      name: "GST + PST 12%",
    });
  });

  it("gives a tax-exempt customer 0%, whatever the shop charges", () => {
    const resolved = resolveTaxRate({
      shop: { taxRateBps: 825, taxRates: [{ ...GST, isDefault: true }] },
      customer: { taxExempt: true },
    });

    expect(resolved).toEqual({ taxRateId: null, taxRateBps: 0, name: null });
  });

  it("exemption beats a rate pinned to the same customer", () => {
    const resolved = resolveTaxRate({
      shop: { taxRateBps: 825, taxRates: [GST, GST_PST] },
      customer: { taxExempt: true, taxRateId: "rate_both" },
    });

    expect(resolved.taxRateBps).toBe(0);
    expect(resolved.taxRateId).toBeNull();
  });

  it("uses the customer's own rate over the shop default", () => {
    const resolved = resolveTaxRate({
      shop: { taxRateBps: 825, taxRates: [{ ...GST, isDefault: true }, GST_PST] },
      customer: { taxRateId: "rate_both" },
    });

    expect(resolved).toEqual({
      taxRateId: "rate_both",
      taxRateBps: 1200,
      name: "GST + PST 12%",
    });
  });

  it("honours a customer pinned to a rate that has since been DEACTIVATED", () => {
    // Deactivating a rate stops it being offered on new documents; it does not
    // change what this particular customer is charged. The module says so, and
    // an out-of-state account silently starting to pay 8.25% is the failure.
    const resolved = resolveTaxRate({
      shop: {
        taxRateBps: 825,
        taxRates: [{ ...GST, isDefault: true }, { ...OUT_OF_STATE, active: false }],
      },
      customer: { taxRateId: "rate_none" },
    });

    expect(resolved.taxRateBps).toBe(0);
    expect(resolved.name).toBe("Out of state 0%");
  });

  it("falls back to the shop default when the customer's rate has been deleted", () => {
    const resolved = resolveTaxRate({
      shop: { taxRateBps: 825, taxRates: [{ ...GST, isDefault: true }] },
      customer: { taxRateId: "rate_that_no_longer_exists" },
    });

    expect(resolved.taxRateId).toBe("rate_gst");
    expect(resolved.taxRateBps).toBe(500);
  });

  it("treats a null customer the same as no customer", () => {
    const shop = { taxRateBps: 825, taxRates: [{ ...GST, isDefault: true }] };
    expect(resolveTaxRate({ shop, customer: null })).toEqual(
      resolveTaxRate({ shop }),
    );
  });

  it("falls back to the shop's plain rate when every named rate is inactive", () => {
    const resolved = resolveTaxRate({
      shop: {
        taxRateBps: 825,
        taxRates: [{ ...GST, active: false }, { ...GST_PST, active: false }],
      },
    });

    expect(resolved).toEqual({ taxRateId: null, taxRateBps: 825, name: null });
  });
});

describe("defaultTaxRate", () => {
  it("picks the starred ACTIVE rate", () => {
    expect(
      defaultTaxRate([GST, { ...GST_PST, isDefault: true }])?.id,
    ).toBe("rate_both");
  });

  it("ignores a starred rate that has been switched off", () => {
    expect(
      defaultTaxRate([
        { ...GST_PST, isDefault: true, active: false },
        GST,
      ])?.id,
    ).toBe("rate_gst");
  });

  it("falls back to the first active rate when nothing is starred", () => {
    expect(defaultTaxRate([GST, GST_PST])?.id).toBe("rate_gst");
  });

  it("returns null when there is nothing usable", () => {
    expect(defaultTaxRate([])).toBeNull();
    expect(defaultTaxRate([{ ...GST, active: false }])).toBeNull();
  });
});

describe("taxLabel", () => {
  it("prints the rate's name when it has one", () => {
    expect(taxLabel("GST", 500)).toBe("GST 5%");
  });

  it("falls back to a bare percentage", () => {
    expect(taxLabel(null, 825)).toBe("Tax (8.25%)");
    expect(taxLabel(undefined, 0)).toBe("Tax (0%)");
  });
});

describe("the Radix 'no tax' sentinel", () => {
  it("is a non-empty string, because an empty Select value is not allowed", () => {
    expect(NO_TAX).toBe("none");
    expect(NO_TAX.length).toBeGreaterThan(0);
  });
});

/**
 * THE SNAPSHOT RULE.
 *
 * Estimates, invoices and recurring schedules each store `taxRateBps` — the
 * number the customer was actually shown — alongside `taxRateId`, the rate it
 * came from. Re-pricing or renaming a TaxRate afterwards must never restate a
 * document that has already been issued: the id is provenance, the bps is the
 * fact.
 *
 * The rule is only enforceable at the call sites (every one of them passes the
 * DOCUMENT's stored bps into `calcTotals`, never the shop's current rate), so
 * this is what that looks like as arithmetic.
 */
describe("documents snapshot their rate, they do not follow it", () => {
  const lines = [{ quantity: 1, unitPriceCents: 10_000, taxable: true }];

  it("keeps an issued invoice at the rate it was issued with", () => {
    // The invoice was raised while the shop charged 5%.
    const issued = resolveTaxRate({
      shop: { taxRateBps: 0, taxRates: [{ ...GST, isDefault: true }] },
    });
    const snapshot = { taxRateId: issued.taxRateId, taxRateBps: issued.taxRateBps };
    const atIssue = calcTotals(lines, snapshot.taxRateBps);

    expect(atIssue.taxCents).toBe(500);
    expect(atIssue.totalCents).toBe(10_500);

    // The shop later re-prices that same rate row to 12%.
    const today = resolveTaxRate({
      shop: {
        taxRateBps: 0,
        taxRates: [{ ...GST, rateBps: 1200, isDefault: true }],
      },
    });
    expect(today.taxRateBps).toBe(1200);

    // The already-issued document still totals what the customer agreed to,
    // because it re-computes from its OWN snapshotted bps.
    const restated = calcTotals(lines, snapshot.taxRateBps);
    expect(restated).toEqual(atIssue);
    expect(restated.totalCents).toBe(10_500);

    // Provenance survives even though the number did not follow.
    expect(snapshot.taxRateId).toBe("rate_gst");
  });

  it("a renamed rate changes the LABEL a new document prints, not an old total", () => {
    const snapshotBps = 500;
    expect(taxLabel("GST 5%", snapshotBps)).toBe("GST 5% 5%");
    // Renaming the row does not touch the stored bps.
    expect(calcTotals(lines, snapshotBps).taxCents).toBe(500);
  });

  it("a tax-exempt customer's issued invoice stays at zero after the exemption is lifted", () => {
    const exempt = resolveTaxRate({
      shop: { taxRateBps: 825 },
      customer: { taxExempt: true },
    });
    expect(calcTotals(lines, exempt.taxRateBps).totalCents).toBe(10_000);

    const noLongerExempt = resolveTaxRate({
      shop: { taxRateBps: 825 },
      customer: { taxExempt: false },
    });
    expect(noLongerExempt.taxRateBps).toBe(825);
    // The issued document still uses its own snapshot.
    expect(calcTotals(lines, exempt.taxRateBps).totalCents).toBe(10_000);
  });
});
