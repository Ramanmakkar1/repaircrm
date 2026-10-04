import { describe, expect, it } from "vitest";

import {
  groupDetail,
  nextPoAction,
  poDateLabel,
  poFilterCounts,
  purchaseOrderSearch,
  receivedLabel,
  stockCount,
  stockSubtitle,
  vendorContactLines,
  vendorSearch,
} from "@/components/inventory/easy-lists";

/**
 * The words on the Easy-mode stock and purchasing cards, and the two search
 * clauses behind the new search boxes. Pure functions, so decided here.
 */

describe("stockCount", () => {
  it("says how many are left for anything that is counted", () => {
    expect(stockCount({ stockQty: 36, lowStockAt: 5 })).toEqual({ value: "36", unit: "left" });
    expect(stockCount({ stockQty: 2, lowStockAt: 5 })).toEqual({ value: "2", unit: "left" });
  });

  it("still says '0 left' for a tracked item that ran out, so Out reads as a fact", () => {
    expect(stockCount({ stockQty: 0, lowStockAt: 5 })).toEqual({ value: "0", unit: "left" });
  });

  it("does not print a scary '0 left' for labour or a service with no reorder point", () => {
    expect(stockCount({ stockQty: 0, lowStockAt: null })).toEqual({ value: "—", unit: "not counted" });
  });

  it("counts an item with no reorder point that does have some on the shelf", () => {
    expect(stockCount({ stockQty: 4, lowStockAt: null })).toEqual({ value: "4", unit: "left" });
  });
});

describe("stockSubtitle and groupDetail", () => {
  it("puts the SKU first, then the price", () => {
    expect(stockSubtitle({ sku: "ACC-CASE-IP14P", priceLabel: "$34.99" })).toBe("ACC-CASE-IP14P · $34.99");
  });

  it("is honest about a missing SKU", () => {
    expect(stockSubtitle({ sku: null, priceLabel: "$5.00" })).toBe("No SKU · $5.00");
    expect(stockSubtitle({ sku: "  ", priceLabel: "$5.00" })).toBe("No SKU · $5.00");
  });

  it("counts a shelf's items in the singular and the plural", () => {
    expect(groupDetail(48, 1)).toBe("48 in stock · 1 item");
    expect(groupDetail(138, 12)).toBe("138 in stock · 12 items");
    expect(groupDetail(0, 2)).toBe("0 in stock · 2 items");
  });
});

describe("purchase order words", () => {
  const expectedAt = new Date("2026-10-04T12:00:00Z");
  const receivedAt = new Date("2026-09-12T12:00:00Z");

  it("says what a buyer wants to know at each stage", () => {
    expect(poDateLabel({ status: "DRAFT", expectedAt: null })).toBe("Not ordered yet");
    expect(poDateLabel({ status: "ORDERED", expectedAt })).toBe("Expected Oct 4, 2026");
    expect(poDateLabel({ status: "ORDERED", expectedAt: null })).toBe("No delivery date");
    expect(poDateLabel({ status: "PARTIAL", expectedAt })).toBe("Expected Oct 4, 2026");
    expect(poDateLabel({ status: "RECEIVED", expectedAt, receivedAt })).toBe("Received Sep 12, 2026");
    expect(poDateLabel({ status: "RECEIVED", expectedAt, receivedAt: null })).toBe("Received");
    expect(poDateLabel({ status: "CANCELED", expectedAt })).toBe("Canceled");
  });

  it("only counts deliveries for an order that is out with the supplier", () => {
    expect(receivedLabel("ORDERED", 0, 7)).toBe("Nothing received yet");
    expect(receivedLabel("PARTIAL", 3, 17)).toBe("3 of 17 received");
    expect(receivedLabel("ORDERED", 0, 0)).toBe("No items");
    expect(receivedLabel("DRAFT", 0, 17)).toBeNull();
    expect(receivedLabel("RECEIVED", 45, 45)).toBeNull();
    expect(receivedLabel("CANCELED", 0, 3)).toBeNull();
  });
});

describe("nextPoAction", () => {
  it("makes placing the order the next step for a draft, even though a draft can be received", () => {
    expect(nextPoAction("DRAFT", true)).toBe("order");
  });

  it("makes booking the delivery in the next step once it is out with the supplier", () => {
    expect(nextPoAction("ORDERED", true)).toBe("receive");
    expect(nextPoAction("PARTIAL", true)).toBe("receive");
  });

  it("has no next step when there is nothing left to receive, or the order is finished", () => {
    expect(nextPoAction("ORDERED", false)).toBeNull();
    expect(nextPoAction("PARTIAL", false)).toBeNull();
    expect(nextPoAction("RECEIVED", true)).toBeNull();
    expect(nextPoAction("CANCELED", true)).toBeNull();
  });
});

describe("poFilterCounts", () => {
  it("adds up each tab, with Open as the three states still in play", () => {
    const counts = poFilterCounts([
      { status: "DRAFT", count: 1 },
      { status: "ORDERED", count: 2 },
      { status: "PARTIAL", count: 1 },
      { status: "RECEIVED", count: 5 },
      { status: "CANCELED", count: 1 },
    ]);
    expect(counts).toMatchObject({ open: 4, all: 10, DRAFT: 1, ORDERED: 2, PARTIAL: 1, RECEIVED: 5, CANCELED: 1 });
  });

  it("shows a zero for a state with no orders, so an empty tab announces itself", () => {
    expect(poFilterCounts([])).toMatchObject({ open: 0, all: 0, PARTIAL: 0, CANCELED: 0 });
  });

  it("ignores a status it does not know rather than inventing a tab count", () => {
    const counts = poFilterCounts([{ status: "MYSTERY", count: 9 }]);
    expect(counts.all).toBe(0);
    expect(counts).not.toHaveProperty("MYSTERY");
  });
});

describe("purchaseOrderSearch", () => {
  it("adds nothing for an empty box", () => {
    expect(purchaseOrderSearch("")).toBeNull();
    expect(purchaseOrderSearch("   ")).toBeNull();
  });

  it("matches a supplier by name, ignoring case", () => {
    expect(purchaseOrderSearch("lone star")).toEqual({
      OR: [{ vendor: { name: { contains: "lone star", mode: "insensitive" } } }],
    });
  });

  it("also matches the order number when the text looks like one", () => {
    for (const text of ["1002", "#1002", "PO 1002", "po #1002", " 1002 "]) {
      expect(purchaseOrderSearch(text)?.OR).toContainEqual({ number: 1002 });
    }
  });

  it("does not turn a name that merely contains digits into a number search", () => {
    const search = purchaseOrderSearch("Depot 24");
    expect(search?.OR).toHaveLength(1);
  });
});

describe("vendorSearch and vendorContactLines", () => {
  it("adds nothing for an empty box and otherwise matches name, email, phone and account", () => {
    expect(vendorSearch(" ")).toBeNull();
    const fields = (vendorSearch("555")?.OR ?? []).map((clause) => Object.keys(clause)[0]);
    expect(fields).toEqual(["name", "email", "phone", "accountNumber"]);
  });

  it("lists how to reach a supplier, phone first, two lines at most", () => {
    expect(vendorContactLines({ phone: "(512) 555-0233", email: "a@b.example", accountNumber: "X1" })).toEqual([
      "(512) 555-0233",
      "a@b.example",
    ]);
    expect(vendorContactLines({ phone: null, email: "a@b.example", accountNumber: "X1" })).toEqual([
      "a@b.example",
      "Account X1",
    ]);
    expect(vendorContactLines({ phone: null, email: null, accountNumber: "X1" })).toEqual(["Account X1"]);
  });

  it("says so when there is nothing to show", () => {
    expect(vendorContactLines({ phone: " ", email: null, accountNumber: null })).toEqual(["No contact details yet"]);
  });
});
