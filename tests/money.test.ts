import { describe, expect, it } from "vitest";

import {
  calcTotals,
  formatBps,
  formatCents,
  invoiceTotals,
  parseBps,
  parseCents,
  sumPayments,
  type LineLike,
} from "@/lib/money";

/**
 * lib/money.ts — the arithmetic every document in the app is built on.
 *
 * The invariant under test is the one the module's own header states: money is
 * an integer number of cents everywhere, totals are COMPUTED and never stored,
 * and tax is rounded ONCE on the taxable subtotal rather than per line.
 */

const line = (over: Partial<LineLike> = {}): LineLike => ({
  quantity: 1,
  unitPriceCents: 0,
  taxable: false,
  ...over,
});

describe("calcTotals", () => {
  it("sums quantity x unit price into an integer subtotal", () => {
    const totals = calcTotals([
      line({ quantity: 3, unitPriceCents: 1999 }),
      line({ quantity: 1, unitPriceCents: 4500 }),
    ]);

    expect(totals.subtotalCents).toBe(3 * 1999 + 4500);
    expect(Number.isInteger(totals.subtotalCents)).toBe(true);
  });

  it("charges tax on the taxable portion only", () => {
    const totals = calcTotals(
      [
        line({ quantity: 1, unitPriceCents: 10_000, taxable: true }),
        // Labour, marked non-taxable: it must not reach the tax base.
        line({ quantity: 1, unitPriceCents: 5_000, taxable: false }),
      ],
      825,
    );

    expect(totals.subtotalCents).toBe(15_000);
    expect(totals.taxableSubtotalCents).toBe(10_000);
    expect(totals.taxCents).toBe(825);
    expect(totals.totalCents).toBe(15_825);
  });

  it("treats a missing `taxable` flag as not taxable", () => {
    const totals = calcTotals([{ quantity: 1, unitPriceCents: 10_000 }], 825);
    expect(totals.taxableSubtotalCents).toBe(0);
    expect(totals.taxCents).toBe(0);
  });

  it("rounds tax ONCE on the taxable subtotal, not per line", () => {
    // Three lines of 3.33 each. Per-line rounding at 8.25% would give
    // round(27.47) x 3 = 27 + 27 + 27 = 81 cents. Rounding once on the 999-cent
    // subtotal gives round(82.4175) = 82. The one-cent gap is exactly the penny
    // drift the module's header promises not to have.
    const lines = [
      line({ quantity: 1, unitPriceCents: 333, taxable: true }),
      line({ quantity: 1, unitPriceCents: 333, taxable: true }),
      line({ quantity: 1, unitPriceCents: 333, taxable: true }),
    ];

    const perLine = lines.reduce(
      (sum, l) => sum + Math.round((l.unitPriceCents * 825) / 10_000),
      0,
    );

    expect(perLine).toBe(81);
    expect(calcTotals(lines, 825).taxCents).toBe(82);
  });

  it("rounds a half cent of tax up", () => {
    // 200 cents at 0.25% = 0.5 cents exactly.
    expect(calcTotals([line({ unitPriceCents: 200, taxable: true })], 25).taxCents)
      .toBe(1);
  });

  it("adds no tax at a zero rate, and defaults the rate to zero", () => {
    const lines = [line({ unitPriceCents: 10_000, taxable: true })];
    expect(calcTotals(lines, 0).taxCents).toBe(0);
    expect(calcTotals(lines).taxCents).toBe(0);
    expect(calcTotals(lines).totalCents).toBe(10_000);
  });

  it("is empty-safe", () => {
    expect(calcTotals([], 825)).toEqual({
      subtotalCents: 0,
      taxableSubtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });

  it("coerces a non-finite quantity or price to zero rather than to NaN", () => {
    // Nothing in the app should hand it these, but a NaN that reaches a total
    // is money that stops adding up everywhere downstream, so the guard matters.
    const totals = calcTotals([
      { quantity: Number.NaN, unitPriceCents: 1000, taxable: true },
      { quantity: 1, unitPriceCents: Number.NaN, taxable: true },
    ], 825);

    expect(totals.subtotalCents).toBe(0);
    expect(totals.totalCents).toBe(0);
  });

  it("carries a discount line through as a negative amount", () => {
    // components/billing/types.ts allows unitPriceCents down to -100_000_000,
    // so a discount is expressed as a negative line rather than a field.
    const totals = calcTotals(
      [
        line({ unitPriceCents: 10_000, taxable: true }),
        line({ unitPriceCents: -2_000, taxable: true }),
      ],
      1000,
    );

    expect(totals.subtotalCents).toBe(8_000);
    expect(totals.taxableSubtotalCents).toBe(8_000);
    expect(totals.taxCents).toBe(800);
    expect(totals.totalCents).toBe(8_800);
  });

  it("scales to a large document without losing a cent to floats", () => {
    const lines = Array.from({ length: 500 }, () =>
      line({ quantity: 7, unitPriceCents: 1_999, taxable: true }),
    );
    const totals = calcTotals(lines, 825);

    expect(totals.subtotalCents).toBe(500 * 7 * 1_999);
    expect(totals.taxCents).toBe(Math.round((500 * 7 * 1_999 * 825) / 10_000));
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.taxCents);
  });
});

describe("sumPayments", () => {
  it("adds payment amounts and is empty-safe", () => {
    expect(sumPayments([])).toBe(0);
    expect(
      sumPayments([{ amountCents: 2_500 }, { amountCents: 100 }]),
    ).toBe(2_600);
  });
});

describe("invoiceTotals", () => {
  const lines = [line({ quantity: 2, unitPriceCents: 5_000, taxable: true })];

  it("reports the balance still owed", () => {
    const totals = invoiceTotals(lines, 1000, [{ amountCents: 4_000 }]);

    expect(totals.totalCents).toBe(11_000);
    expect(totals.paidCents).toBe(4_000);
    expect(totals.balanceCents).toBe(7_000);
  });

  it("goes negative when the customer overpaid", () => {
    const totals = invoiceTotals(lines, 1000, [{ amountCents: 12_000 }]);
    expect(totals.balanceCents).toBe(-1_000);
  });

  it("defaults to no payments", () => {
    expect(invoiceTotals(lines, 1000).balanceCents).toBe(11_000);
  });

  it("is unaffected by the ORDER payments arrive in", () => {
    const a = invoiceTotals(lines, 1000, [
      { amountCents: 1_000 },
      { amountCents: 9_999 },
    ]);
    const b = invoiceTotals(lines, 1000, [
      { amountCents: 9_999 },
      { amountCents: 1_000 },
    ]);
    expect(a).toEqual(b);
  });
});

describe("formatCents", () => {
  it("renders whole dollars from integer cents", () => {
    expect(formatCents(123_456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
  });

  it("renders a negative amount with the minus outside the sign", () => {
    expect(formatCents(-500)).toBe("-$5.00");
  });

  it("treats null and undefined as zero", () => {
    expect(formatCents(null)).toBe("$0.00");
    expect(formatCents(undefined)).toBe("$0.00");
  });
});

describe("formatBps / parseBps", () => {
  it("renders basis points as a percentage", () => {
    expect(formatBps(825)).toBe("8.25%");
    expect(formatBps(500)).toBe("5%");
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(null)).toBe("0%");
  });

  it("parses what a human types back into basis points", () => {
    expect(parseBps("8.25")).toBe(825);
    expect(parseBps("8.25%")).toBe(825);
    expect(parseBps(8.25)).toBe(825);
    expect(parseBps("")).toBe(0);
    expect(parseBps("not a rate")).toBe(0);
    expect(parseBps(null)).toBe(0);
  });

  it("round-trips through the display format", () => {
    for (const bps of [0, 5, 500, 825, 1300, 1999]) {
      expect(parseBps(formatBps(bps))).toBe(bps);
    }
  });
});

describe("parseCents", () => {
  it("parses currency text into integer cents", () => {
    expect(parseCents("$1,234.56")).toBe(123_456);
    expect(parseCents("1234.56")).toBe(123_456);
    expect(parseCents("12")).toBe(1_200);
    expect(parseCents(12.34)).toBe(1_234);
  });

  it("is exact for every two-decimal amount, which is what staff type", () => {
    // `parseCents` multiplies a float by 100 — the one place a float touches
    // money. Verified exhaustively across the range a repair shop uses so the
    // shortcut is a measured one rather than an assumed one.
    for (let cents = 0; cents <= 200_000; cents += 1) {
      expect(parseCents((cents / 100).toFixed(2))).toBe(cents);
    }
  });

  it("rounds a third decimal the same way calcTotals does — half up", () => {
    expect(parseCents("1.005")).toBe(101);
    expect(parseCents("1.004")).toBe(100);
    expect(parseCents("1.006")).toBe(101);
  });

  it("returns zero for anything unparseable", () => {
    expect(parseCents("")).toBe(0);
    expect(parseCents("abc")).toBe(0);
    expect(parseCents(null)).toBe(0);
    expect(parseCents(undefined)).toBe(0);
  });

  it("keeps an explicit minus, so a negative line can be typed", () => {
    expect(parseCents("-5.00")).toBe(-500);
  });

  it("round-trips through the display format", () => {
    for (const cents of [0, 5, 99, 100, 123_456, 999_999_99]) {
      expect(parseCents(formatCents(cents))).toBe(cents);
    }
  });
});

/**
 * FIXED — `parseCents` used to round a half cent the opposite way to
 * `calcTotals`.
 *
 * `calcTotals` computes tax with integer arithmetic and rounds a half cent UP
 * (200 cents at 0.25% -> 1 cent, asserted above). `parseCents` multiplied a
 * float by 100, and `1.005 * 100` is 100.49999999999999 in IEEE 754, so the
 * same half cent rounded DOWN — the two halves of one module disagreeing about
 * what a half cent means.
 *
 * Narrow in practice (every two-decimal amount parses exactly either way, as
 * asserted exhaustively above) but it stops being narrow the day somebody
 * pastes a three-decimal figure out of a spreadsheet. `parseCents` now scales
 * through a fixed-precision string, which takes the binary representation out
 * of the rounding decision.
 */
describe("half-cent rounding", () => {
  it("rounds a half cent up, the same direction as calcTotals", () => {
    expect(parseCents("1.005")).toBe(101);
    expect(parseCents("0.005")).toBe(1);
    expect(parseCents("2.005")).toBe(201);
  });

  it("still parses every ordinary two-decimal amount exactly", () => {
    for (let cents = 0; cents <= 200_000; cents += 7) {
      expect(parseCents((cents / 100).toFixed(2))).toBe(cents);
    }
  });
});

/**
 * FIXED — accounting-negative zero.
 *
 * `Math.round` rounds half toward +Infinity, so exactly -0.5 cents of tax
 * rounds to `-0`, not `0`. `Intl.NumberFormat` prints that sign, so a
 * zero-dollar tax line rendered "-$0.00" on a customer-facing invoice.
 *
 * Reachable through an all-taxable credit/discount document: line items are
 * allowed down to -$1,000,000 (components/billing/types.ts), so a -$2.00
 * taxable line at a 0.25% rate produces exactly this. `formatCents` now
 * collapses negative zero — there is no negative zero amount of money.
 */
describe("negative-zero tax", () => {
  it("computes -0 cents of tax on a small negative taxable subtotal", () => {
    const totals = calcTotals([line({ unitPriceCents: -200, taxable: true })], 25);
    expect(Object.is(totals.taxCents, -0)).toBe(true);
  });

  it("formats that -0 as '$0.00', with no minus sign", () => {
    const totals = calcTotals([line({ unitPriceCents: -200, taxable: true })], 25);
    expect(formatCents(totals.taxCents)).toBe("$0.00");
  });

  it("still signs a genuinely negative amount", () => {
    expect(formatCents(-500)).toBe("-$5.00");
  });
});
