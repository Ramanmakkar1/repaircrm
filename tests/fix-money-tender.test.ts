import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CashTender, QuickAmount, billLabel, cashChange, quickBillsFor } from "@/components/pos/tender-pieces";
import { MethodTiles, paymentButtonLabel } from "@/components/billing/payment-dialog";
import { defaultRefundPayment, refundOutcome, type RefundablePayment } from "@/components/billing/refund-dialog";

/**
 * Take payment on an invoice works like the register's tender: the same cash
 * change maths, one-tap bills and method tiles; and the Refund dialog uses the
 * same tiles and says, before anything is pressed, what will happen.
 */

describe("cash change, shared by the register and Take payment", () => {
  it("is integer cents, and says when they are still short", () => {
    expect(cashChange("50", 2_705)).toEqual({ receivedCents: 5_000, changeCents: 2_295, short: false });
    expect(cashChange("20.00", 2_705)).toEqual({ receivedCents: 2_000, changeCents: -705, short: true });
    expect(cashChange("27.05", 2_705).changeCents).toBe(0);
    expect(cashChange("junk", 100).short).toBe(true);
  });

  it("offers only the bills that can settle the amount on their own", () => {
    expect(quickBillsFor(2_705)).toEqual([
      { cents: 2_000, disabled: true },
      { cents: 5_000, disabled: false },
      { cents: 10_000, disabled: false },
    ]);
    expect(billLabel(5_000)).toBe("$50");
  });

  it("draws 'Cash handed over', the bills and the change due in words", () => {
    const html = renderToStaticMarkup(
      React.createElement(CashTender, { dueCents: 2_705, received: "50.00", onReceived: () => {} }),
    );
    expect(html).toContain("Cash handed over");
    expect(html).toContain("Exact");
    expect(html).toContain("$50");
    expect(html).toContain("Change due");
    expect(html).toContain("$22.95");
    // 48px targets.
    expect(html).toContain("min-h-12");
  });

  it("marks the quick amount on screen as pressed, not by colour alone", () => {
    const html = renderToStaticMarkup(React.createElement(QuickAmount, { label: "All of it · $27.05", onClick: () => {}, pressed: true }));
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("Take payment", () => {
  it("says what the big button does, with the amount", () => {
    expect(paymentButtonLabel("CARD", 2_705)).toBe("Approved — take $27.05");
    expect(paymentButtonLabel("CASH", 2_705)).toBe("Take $27.05 in cash");
    expect(paymentButtonLabel("CREDIT", 2_705)).toBe("Use $27.05 of store credit");
  });

  it("method tiles post the same `method` field, and can carry refund words", () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodTiles, { value: "CARD", onChange: () => {}, labelId: "refund-method-label", labels: { CARD: "Their card" } }),
    );
    expect(html).toContain('name="method" value="CARD"');
    expect(html).toContain('aria-labelledby="refund-method-label"');
    expect(html).toContain("Their card");
    expect(html).toContain('role="radiogroup"');
  });
});

describe("Refund: what will happen, before it happens", () => {
  const payments: RefundablePayment[] = [
    { id: "p_cash", label: "Cash · $20.00 · Sep 20", amountCents: 2_000, isStripe: false, canRefundToCard: false, method: "CASH" },
    { id: "p_card", label: "Card (reader) · $34.10 · Sep 21", amountCents: 3_410, isStripe: true, canRefundToCard: true, method: "CARD" },
  ];

  it("starts a card refund on the card payment it can go back to", () => {
    expect(defaultRefundPayment(payments, "CARD")).toBe("p_card");
    expect(defaultRefundPayment(payments, "CASH")).toBe("__none__");
    expect(defaultRefundPayment([payments[0]], "CARD")).toBe("__none__");
  });

  it("never lets 'write it down' read like money moving", () => {
    expect(refundOutcome({ amountCents: 2_705, method: "CARD", toCard: true, paymentLabel: "Card (reader)", customerName: "Owen" })).toBe(
      "$27.05 goes back to the card it was paid with (Card (reader)). It can take a few days to reach them.",
    );
    expect(refundOutcome({ amountCents: 2_705, method: "CARD", toCard: false, customerName: "Owen" })).toMatch(/does not move the money/);
    expect(refundOutcome({ amountCents: 2_705, method: "CASH", toCard: false, customerName: "Owen" })).toBe(
      "Take $27.05 out of the cash drawer and hand it over.",
    );
    expect(refundOutcome({ amountCents: 2_705, method: "CREDIT", toCard: false, customerName: "Owen" })).toBe(
      "Adds $27.05 to Owen's store credit to spend next time.",
    );
  });
});
