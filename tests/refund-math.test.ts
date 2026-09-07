import { describe, expect, it } from "vitest";

import {
  refundAwareTotals,
  refundableCents,
  statusForNetPaid,
  sumRefunds,
  type RefundLike,
} from "@/components/billing/refund-math";
import { invoiceTotals } from "@/lib/money";

/**
 * components/billing/refund-math.ts — the refund-aware layer that wraps
 * `calcTotals`.
 *
 * The one rule the shop's money depends on: a refund can never exceed what
 * actually came in. Not the invoice total, not what is owed — what was
 * COLLECTED, less what has already gone back out.
 */

const lines = [{ quantity: 1, unitPriceCents: 10_000, taxable: true }];
const RATE = 1000; // 10% -> a $110.00 invoice.
const TOTAL = 11_000;

const completed = (amountCents: number): RefundLike => ({
  amountCents,
  status: "completed",
});

describe("sumRefunds", () => {
  it("adds completed refunds", () => {
    expect(sumRefunds([completed(1_000), completed(500)])).toBe(1_500);
  });

  it("counts a PENDING refund — the shop has already told Stripe to send it", () => {
    expect(sumRefunds([{ amountCents: 2_500, status: "pending" }])).toBe(2_500);
  });

  it("does NOT count a FAILED refund — that money never left", () => {
    expect(
      sumRefunds([completed(1_000), { amountCents: 9_999, status: "failed" }]),
    ).toBe(1_000);
  });

  it("counts a row with no status, which is how a hand-recorded refund arrives", () => {
    expect(sumRefunds([{ amountCents: 700 }])).toBe(700);
    expect(sumRefunds([{ amountCents: 700, status: null }])).toBe(700);
  });

  it("is empty-safe", () => {
    expect(sumRefunds([])).toBe(0);
  });
});

describe("refundableCents", () => {
  it("is what came in, less what has gone back out", () => {
    expect(
      refundableCents([{ amountCents: 11_000 }], [completed(4_000)]),
    ).toBe(7_000);
  });

  it("NEVER exceeds what was actually paid, even on an unpaid invoice", () => {
    expect(refundableCents([], [])).toBe(0);
    expect(refundableCents([{ amountCents: 2_500 }], [])).toBe(2_500);
  });

  it("falls to zero once everything collected has been handed back", () => {
    expect(
      refundableCents([{ amountCents: 11_000 }], [completed(11_000)]),
    ).toBe(0);
  });

  it("clamps at zero rather than reporting a negative ceiling", () => {
    // Only reachable by a direct database edit, but a negative ceiling would
    // read on screen as a credit the shop owes.
    expect(
      refundableCents([{ amountCents: 1_000 }], [completed(5_000)]),
    ).toBe(0);
  });

  it("re-opens the ceiling when a refund is marked failed", () => {
    const payments = [{ amountCents: 11_000 }];
    expect(refundableCents(payments, [{ amountCents: 11_000, status: "pending" }]))
      .toBe(0);
    expect(refundableCents(payments, [{ amountCents: 11_000, status: "failed" }]))
      .toBe(11_000);
  });
});

describe("refundAwareTotals", () => {
  it("agrees with invoiceTotals when nothing has been refunded", () => {
    const plain = invoiceTotals(lines, RATE, [{ amountCents: 4_000 }]);
    const aware = refundAwareTotals(lines, RATE, [{ amountCents: 4_000 }], []);

    expect(aware.subtotalCents).toBe(plain.subtotalCents);
    expect(aware.taxCents).toBe(plain.taxCents);
    expect(aware.totalCents).toBe(plain.totalCents);
    expect(aware.balanceCents).toBe(plain.balanceCents);
    expect(aware.refundedCents).toBe(0);
    expect(aware.netPaidCents).toBe(aware.paidCents);
  });

  it("puts the balance back on the customer when money is refunded", () => {
    const aware = refundAwareTotals(
      lines,
      RATE,
      [{ amountCents: TOTAL }],
      [completed(3_000)],
    );

    expect(aware.totalCents).toBe(TOTAL);
    expect(aware.paidCents).toBe(TOTAL);
    expect(aware.refundedCents).toBe(3_000);
    expect(aware.netPaidCents).toBe(8_000);
    expect(aware.balanceCents).toBe(3_000);
    expect(aware.refundableCents).toBe(8_000);
  });

  it("never lets a partial refund raise the ceiling above what came in", () => {
    const aware = refundAwareTotals(
      lines,
      RATE,
      [{ amountCents: 5_000 }],
      [completed(2_000)],
    );

    expect(aware.refundableCents).toBe(3_000);
    expect(aware.refundableCents).toBeLessThanOrEqual(aware.paidCents);
  });

  it("keeps the ceiling at zero when the invoice was never paid", () => {
    const aware = refundAwareTotals(lines, RATE, [], []);
    expect(aware.refundableCents).toBe(0);
    expect(aware.balanceCents).toBe(TOTAL);
  });

  it("holds the ceiling invariant across a fuzz of payment/refund histories", () => {
    for (let paid = 0; paid <= 20_000; paid += 137) {
      for (let refunded = 0; refunded <= 20_000; refunded += 911) {
        const aware = refundAwareTotals(
          lines,
          RATE,
          [{ amountCents: paid }],
          [completed(refunded)],
        );
        expect(aware.refundableCents).toBeGreaterThanOrEqual(0);
        expect(aware.refundableCents).toBeLessThanOrEqual(aware.paidCents);
        expect(aware.balanceCents).toBe(aware.totalCents - aware.netPaidCents);
      }
    }
  });

  it("defaults both payments and refunds to empty", () => {
    expect(refundAwareTotals(lines, RATE)).toEqual(
      refundAwareTotals(lines, RATE, [], []),
    );
  });

  it("uses the DOCUMENT's snapshotted rate, not a live one", () => {
    // Same lines, two different stored rates — the wrapper never re-resolves.
    expect(refundAwareTotals(lines, 500).totalCents).toBe(10_500);
    expect(refundAwareTotals(lines, 1200).totalCents).toBe(11_200);
  });
});

describe("statusForNetPaid", () => {
  it("walks a fully-refunded invoice back to SENT", () => {
    expect(statusForNetPaid(0, TOTAL)).toBe("SENT");
    expect(statusForNetPaid(-500, TOTAL)).toBe("SENT");
  });

  it("reports PARTIAL while some of the money is still held", () => {
    expect(statusForNetPaid(1, TOTAL)).toBe("PARTIAL");
    expect(statusForNetPaid(TOTAL - 1, TOTAL)).toBe("PARTIAL");
  });

  it("reports PAID at and above the total", () => {
    expect(statusForNetPaid(TOTAL, TOTAL)).toBe("PAID");
    expect(statusForNetPaid(TOTAL + 5_000, TOTAL)).toBe("PAID");
  });

  it("calls a zero-total invoice PAID once any money is held", () => {
    expect(statusForNetPaid(1, 0)).toBe("PAID");
  });

  it("agrees with refundAwareTotals end to end", () => {
    const paidInFull = refundAwareTotals(lines, RATE, [{ amountCents: TOTAL }]);
    expect(statusForNetPaid(paidInFull.netPaidCents, paidInFull.totalCents)).toBe(
      "PAID",
    );

    const refundedInFull = refundAwareTotals(
      lines,
      RATE,
      [{ amountCents: TOTAL }],
      [completed(TOTAL)],
    );
    expect(
      statusForNetPaid(refundedInFull.netPaidCents, refundedInFull.totalCents),
    ).toBe("SENT");

    const refundedInPart = refundAwareTotals(
      lines,
      RATE,
      [{ amountCents: TOTAL }],
      [completed(1_000)],
    );
    expect(
      statusForNetPaid(refundedInPart.netPaidCents, refundedInPart.totalCents),
    ).toBe("PARTIAL");
  });
});

/**
 * DEFECT — the refund-aware layer and the payment-recording layer disagree
 * about what is owed on a refunded invoice.
 *
 * `refundAwareTotals` (this file) computes balance = total - (paid - refunded).
 * `lib/payments/record.ts` computes it with `invoiceTotals`, which knows nothing
 * about refunds: balance = total - paid.
 *
 * On an invoice that was paid in full and then refunded in full:
 *
 *   the invoice page   (app/(app)/invoices/[id]/page.tsx, refundAwareTotals)
 *                      shows the full amount owed again, and the status walks
 *                      back to SENT — see `statusForNetPaid` above;
 *   the payment form   (recordPayment, invoiceTotals) sees balance = $0.00 and
 *                      refuses EVERY amount with "That is more than the $0.00
 *                      still outstanding."
 *
 * So the screen invites a payment the counter cannot take. Asserted in
 * tests/payments-record.test.ts, where the refusal actually happens; recorded
 * here too because this is the file whose definition of "owed" is the right one.
 */
describe("refunded invoices and the payment ceiling", () => {
  it("says a fully-refunded invoice is owed in full again", () => {
    const aware = refundAwareTotals(
      lines,
      RATE,
      [{ amountCents: TOTAL }],
      [completed(TOTAL)],
    );
    expect(aware.balanceCents).toBe(TOTAL);
  });

  it("DEFECT: invoiceTotals — what recordPayment uses — says nothing is owed", () => {
    const blind = invoiceTotals(lines, RATE, [{ amountCents: TOTAL }]);
    expect(blind.balanceCents).toBe(0);
  });
});
