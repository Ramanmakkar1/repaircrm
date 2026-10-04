import { describe, expect, it } from "vitest";

import { STOCK_META, stockFlag, stockStatus } from "@/components/inventory/format";

/**
 * The one-word "Low" / "Out" flag on the Easy-mode stock list. It must follow
 * the same rule as the badge and the Low / Out filters, so a row is never
 * flagged in the list but missing from the filter (or the other way round).
 */
describe("stockFlag", () => {
  it("says Low when on hand is at or below the reorder point", () => {
    expect(stockFlag({ stockQty: 2, lowStockAt: 3 })?.label).toBe("Low");
    expect(stockFlag({ stockQty: 3, lowStockAt: 3 })?.label).toBe("Low");
  });

  it("says Out when a tracked item has none left, including a negative count", () => {
    expect(stockFlag({ stockQty: 0, lowStockAt: 3 })?.label).toBe("Out");
    expect(stockFlag({ stockQty: -2, lowStockAt: 3 })?.label).toBe("Out");
    expect(stockFlag({ stockQty: 0, lowStockAt: 0 })?.label).toBe("Out");
  });

  it("says nothing for a healthy item", () => {
    expect(stockFlag({ stockQty: 4, lowStockAt: 3 })).toBeNull();
    expect(stockFlag({ stockQty: 1, lowStockAt: 0 })).toBeNull();
  });

  it("says nothing for an item with no reorder point, such as labour at 0 by design", () => {
    expect(stockFlag({ stockQty: 0, lowStockAt: null })).toBeNull();
    expect(stockFlag({ stockQty: 7, lowStockAt: null })).toBeNull();
  });

  it("uses the badge's own tones, so Low is amber and Out is red everywhere", () => {
    expect(stockFlag({ stockQty: 2, lowStockAt: 3 })?.tone).toBe(STOCK_META.low.tone);
    expect(stockFlag({ stockQty: 0, lowStockAt: 3 })?.tone).toBe(STOCK_META.out.tone);
  });

  it("agrees with stockStatus for every combination", () => {
    for (const stockQty of [-1, 0, 1, 2, 3, 4]) {
      for (const lowStockAt of [null, 0, 2, 3]) {
        const status = stockStatus({ stockQty, lowStockAt });
        const flag = stockFlag({ stockQty, lowStockAt });
        expect(flag === null).toBe(status === "in" || status === "untracked");
        if (flag) expect(flag.label === "Low").toBe(status === "low");
      }
    }
  });
});
