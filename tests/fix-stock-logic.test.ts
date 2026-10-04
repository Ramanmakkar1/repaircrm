import { describe, expect, it } from "vitest";

import {
  dayInputValue,
  dayKeyOf,
  formatDay,
  formatInstant,
  formatInstantDay,
  isLate,
  parseDayInput,
  shopTodayKey,
} from "@/lib/inventory/dates";
import { lineArrival, poFilterCounts, poProgressLine, stockEmptyState } from "@/components/inventory/easy-lists";
import { PO_STATUS_META, asPoFilter, poFilterStatuses } from "@/components/inventory/purchasing";
import {
  addLowItems,
  addOneOff,
  addProduct,
  draftFields,
  draftIssues,
  draftTotals,
  emptyDraft,
  firstTapQuantity,
  initialDraft,
  initialStep,
  lowItemsFor,
  parseAddParam,
  parseMoneyText,
  quantityOf,
  setProductQuantity,
  setQuantity,
  stockLine,
  type PoBuilderProduct,
} from "@/components/inventory/po-flow";
import { bookInCount, bookInIssues, bookInQuantities, bookInResult, orderTheRestHref, type ReceivableLine } from "@/components/inventory/receive-flow";
import { lowStockResultWords, onOrderByProduct, orderMoreHref, planLowStockOrders, type LowProduct } from "@/components/inventory/restock";
import { serialCountWords, stockChangeWords } from "@/components/inventory/stock-words";
import { asLabelSize } from "@/components/inventory/label-sizes";
import { inventoryGroups } from "@/lib/inventory/groups";

const EDMONTON = "America/Edmonton";

// ---------------------------------------------------------------------------
// Dates follow the shop, never the server
// ---------------------------------------------------------------------------

describe("stock and purchasing dates", () => {
  it("stores a delivery day as UTC midnight of that day, whatever zone the server runs in", () => {
    expect(parseDayInput("2026-10-04")?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(parseDayInput("")).toBeNull();
    expect(parseDayInput("2026-02-31")).toBeNull();
    expect(parseDayInput("tomorrow")).toBeNull();
  });

  it("reads a stored day back as the same calendar day, including rows saved at Edmonton midnight before", () => {
    // Old rows: midnight on a server pinned to Edmonton = 06:00 UTC the same day.
    expect(dayKeyOf(new Date("2026-10-04T06:00:00Z"))).toBe("2026-10-04");
    expect(dayKeyOf(parseDayInput("2026-10-04"))).toBe("2026-10-04");
    expect(dayInputValue(new Date("2026-10-04T06:00:00Z"))).toBe("2026-10-04");
    expect(formatDay(parseDayInput("2026-10-04"))).toBe("Oct 4, 2026");
  });

  it("is late only once the promised day is over on the SHOP's calendar", () => {
    const expectedAt = parseDayInput("2026-10-04");
    // 9pm on Oct 4 in Edmonton is already Oct 5 in UTC: a UTC server would call it late.
    const evening = Date.parse("2026-10-05T03:00:00Z");
    expect(shopTodayKey(evening, EDMONTON)).toBe("2026-10-04");
    expect(shopTodayKey(evening, "UTC")).toBe("2026-10-05");
    expect(isLate({ status: "ORDERED", expectedAt }, shopTodayKey(evening, EDMONTON))).toBe(false);
    // The next morning in Edmonton it is.
    const nextMorning = Date.parse("2026-10-05T15:00:00Z");
    expect(isLate({ status: "ORDERED", expectedAt }, shopTodayKey(nextMorning, EDMONTON))).toBe(true);
    expect(isLate({ status: "PARTIAL", expectedAt }, "2026-10-05")).toBe(true);
    // A draft, an arrived order or an order with no date is never late.
    expect(isLate({ status: "DRAFT", expectedAt }, "2026-10-09")).toBe(false);
    expect(isLate({ status: "RECEIVED", expectedAt }, "2026-10-09")).toBe(false);
    expect(isLate({ status: "ORDERED", expectedAt: null }, "2026-10-09")).toBe(false);
  });

  it("prints a moment on the shop's wall clock", () => {
    const at = new Date("2026-10-05T03:30:00Z");
    expect(formatInstant(at, EDMONTON)).toBe("Oct 4, 2026 · 9:30 PM");
    expect(formatInstantDay(at, EDMONTON)).toBe("Oct 4, 2026");
    expect(formatInstantDay(at, "UTC")).toBe("Oct 5, 2026");
    // A bad zone in the database falls back rather than breaking the page.
    expect(formatInstantDay(at, "Not/AZone")).toBe("Oct 5, 2026");
  });
});

// ---------------------------------------------------------------------------
// Purchase order words
// ---------------------------------------------------------------------------

describe("purchase order wording", () => {
  it("says 'Part arrived', not 'Partial'", () => {
    expect(PO_STATUS_META.PARTIAL.label).toBe("Part arrived");
    expect(PO_STATUS_META.DRAFT.hint).not.toMatch(/vendor/i);
  });

  it("keeps every old ?status= working and adds On the way", () => {
    for (const key of ["open", "all", "DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELED", "onway"]) {
      expect(asPoFilter(key)).toBe(key);
    }
    expect(asPoFilter("nonsense")).toBe("open");
    expect(poFilterStatuses("onway")).toEqual(["ORDERED", "PARTIAL"]);
    expect(poFilterStatuses("open")).toEqual(["DRAFT", "ORDERED", "PARTIAL"]);
    expect(poFilterStatuses("all")).toBeNull();
    expect(poFilterStatuses("RECEIVED")).toEqual(["RECEIVED"]);
  });

  it("counts On the way as ordered plus part-arrived", () => {
    const counts = poFilterCounts([
      { status: "DRAFT", count: 2 },
      { status: "ORDERED", count: 3 },
      { status: "PARTIAL", count: 1 },
      { status: "RECEIVED", count: 5 },
    ]);
    expect(counts.onway).toBe(4);
    expect(counts.open).toBe(6);
    expect(counts.all).toBe(11);
  });

  it("puts where an order is in one line, late in words", () => {
    const expectedAt = parseDayInput("2026-10-04");
    const totals = { orderedQty: 7, receivedQty: 0 };
    expect(poProgressLine({ status: "ORDERED", expectedAt }, totals, "2026-10-02", EDMONTON)).toEqual({ text: "0 of 7 arrived · due Oct 4", late: false });
    expect(poProgressLine({ status: "ORDERED", expectedAt }, totals, "2026-10-04", EDMONTON).text).toBe("0 of 7 arrived · due today");
    expect(poProgressLine({ status: "PARTIAL", expectedAt }, { orderedQty: 7, receivedQty: 2 }, "2026-10-06", EDMONTON)).toEqual({
      text: "Late · 2 of 7 arrived · was due Oct 4",
      late: true,
    });
    expect(poProgressLine({ status: "DRAFT", expectedAt: null }, totals, "2026-10-04", EDMONTON).text).toBe("7 items · not ordered yet");
    expect(
      poProgressLine({ status: "RECEIVED", expectedAt, receivedAt: new Date("2026-10-05T03:00:00Z") }, { orderedQty: 7, receivedQty: 7 }, "2026-10-06", EDMONTON).text,
    ).toBe("All 7 arrived · Oct 4, 2026");
  });

  it("says how much of a line is in with a word, not a colour", () => {
    expect(lineArrival(2, 0)).toEqual({ text: "ordered 2 · arrived 0", word: "Waiting" });
    expect(lineArrival(5, 2).word).toBe("Part arrived");
    expect(lineArrival(5, 5).word).toBe("All here");
  });
});

// ---------------------------------------------------------------------------
// Stock list empty states
// ---------------------------------------------------------------------------

describe("stock empty states", () => {
  const view = { query: "", category: "", group: "" };

  it("says an empty Out of stock view is good news, not a failed search", () => {
    expect(stockEmptyState({ ...view, filter: "out" })).toEqual({
      title: "Nothing is out of stock",
      hint: "Everything you count has at least one on the shelf.",
      action: "all",
    });
    expect(stockEmptyState({ ...view, filter: "low" }).title).toBe("Nothing is running low");
  });

  it("keeps the view but offers every shelf when only a shelf is narrowing it", () => {
    expect(stockEmptyState({ ...view, filter: "out", group: "batteries" })).toMatchObject({ title: "Nothing on this shelf is out of stock", action: "everyShelf" });
  });

  it("only calls it 'nothing matches' when a search or category found nothing", () => {
    expect(stockEmptyState({ ...view, filter: "out", query: "zzz" })).toMatchObject({ title: "Nothing matches those filters", action: "clear" });
    expect(stockEmptyState({ ...view, filter: "all" })).toMatchObject({ title: "No products yet", action: "add" });
  });
});

// ---------------------------------------------------------------------------
// New order
// ---------------------------------------------------------------------------

function product(over: Partial<PoBuilderProduct> = {}): PoBuilderProduct {
  return {
    id: "p",
    name: "Part",
    sku: "SKU",
    vendorSku: null,
    vendorId: "v1",
    costCents: 1250,
    stockQty: 10,
    lowStockAt: 3,
    reorderQty: null,
    low: false,
    ...over,
  };
}

const vendors = [
  { id: "v0", name: "Austin Accessory Wholesale" },
  { id: "v1", name: "Meridian Component Group" },
];

describe("new order: who it is for", () => {
  it("never picks a supplier on its own: it opens on the supplier tiles", () => {
    const draft = initialDraft({ vendors, products: [] });
    expect(draft.vendorId).toBe("");
    expect(initialStep(draft)).toBe(0);
    expect(draftIssues(draft)[0]).toEqual({ step: 0, message: "Choose who you are ordering from." });
  });

  it("takes a supplier named in the address on purpose, and opens on the items", () => {
    const draft = initialDraft({ vendorId: "v1", vendors, products: [] });
    expect(draft.vendorId).toBe("v1");
    expect(initialStep(draft)).toBe(1);
    // An id that is not one of this shop's active suppliers is ignored, not trusted.
    expect(initialDraft({ vendorId: "elsewhere", vendors, products: [] }).vendorId).toBe("");
  });

  it("starts with the products the address asked for (Order more, Order the rest)", () => {
    const products = [product({ id: "a", name: "Battery" }), product({ id: "b", name: "Screen", low: true, stockQty: 1, lowStockAt: 3 })];
    const draft = initialDraft({ vendors, products, add: "a:4,b:,zzz:9,a:7" });
    expect(draft.lines.map((line) => [line.productId, line.quantity])).toEqual([
      ["a", 4],
      ["b", 5], // no number: its suggested reorder quantity (twice the point, minus what is left)
    ]);
    expect(parseAddParam(undefined, products)).toEqual([]);
  });
});

describe("new order: what is on it", () => {
  const low = product({ id: "low", name: "Low screen", low: true, stockQty: 1, lowStockAt: 3, reorderQty: 6 });
  const unassigned = product({ id: "free", name: "Any-supplier cable", vendorId: null, low: true, stockQty: 0, lowStockAt: 2 });
  const elsewhere = product({ id: "other", name: "Other supplier's part", vendorId: "v0", low: true, stockQty: 0, lowStockAt: 2 });
  const fine = product({ id: "fine", name: "Plenty" });

  it("adds a low item at its usual amount on the first tap, anything else one at a time", () => {
    expect(firstTapQuantity(low)).toBe(6);
    expect(firstTapQuantity(fine)).toBe(1);
    let draft = addProduct(emptyDraft("v1"), fine);
    draft = addProduct(draft, fine);
    expect(draft.lines).toHaveLength(1);
    expect(quantityOf(draft, "fine")).toBe(2);
    expect(draft.lines[0].unitCostCents).toBe(1250);
  });

  it("'Running low' adds every low item this supplier sells (or nobody does), once", () => {
    expect(lowItemsFor([low, unassigned, elsewhere, fine], "v1").map((p) => p.id)).toEqual(["low", "free"]);
    const first = addLowItems(emptyDraft("v1"), [low, unassigned, elsewhere, fine]);
    expect(first.added).toBe(2);
    expect(first.draft.lines.map((line) => [line.productId, line.quantity])).toEqual([
      ["low", 6],
      ["free", 4],
    ]);
    // A second tap adds nothing twice.
    expect(addLowItems(first.draft, [low, unassigned]).added).toBe(0);
  });

  it("takes a line off when its stepper reaches zero", () => {
    let draft = addProduct(emptyDraft("v1"), fine, 2);
    draft = setQuantity(draft, draft.lines[0].key, 0);
    expect(draft.lines).toEqual([]);
    draft = setProductQuantity(draft, fine, 3);
    expect(quantityOf(draft, "fine")).toBe(3);
  });

  it("posts exactly the fields the old form posted, plus nothing it did not", () => {
    let draft = addProduct(emptyDraft("v1"), fine, 2);
    draft = addOneOff(draft, { description: "  Back glass  ", quantity: 1, unitCostCents: 900 });
    draft = { ...draft, shippingCents: 2400, expectedAt: "2026-10-09", notes: "Call first" };
    const fields = Object.fromEntries(draftFields(draft));
    expect(Object.keys(fields)).toEqual(["vendorId", "lines", "shippingCents", "expectedAt", "notes"]);
    expect(JSON.parse(fields.lines)).toEqual([
      { productId: "fine", description: "Plenty", quantity: 2, unitCostCents: 1250 },
      { productId: null, description: "Back glass", quantity: 1, unitCostCents: 900 },
    ]);
    expect(fields.shippingCents).toBe("2400");
    // The money is the same poTotals the list, the order page and the printed sheet use.
    expect(draftTotals(draft)).toMatchObject({ subtotalCents: 3400, shippingCents: 2400, totalCents: 5800 });
    expect(draftIssues(draft)).toEqual([]);
  });

  it("reads money the way it is typed, and refuses what is not money", () => {
    expect(parseMoneyText("12.50")).toBe(1250);
    expect(parseMoneyText("$1,200")).toBe(120000);
    expect(parseMoneyText("")).toBe(0);
    expect(parseMoneyText("12.505")).toBeNull();
    expect(parseMoneyText("twelve")).toBeNull();
  });

  it("describes a tile's stock in words", () => {
    expect(stockLine({ stockQty: 2, lowStockAt: 5, onOrder: 3 })).toBe("2 left · reorder at 5 · 3 on order");
    expect(stockLine({ stockQty: 0, lowStockAt: null })).toBe("Not counted");
  });
});

// ---------------------------------------------------------------------------
// Book in delivery
// ---------------------------------------------------------------------------

describe("book in delivery", () => {
  const lines: ReceivableLine[] = [
    { id: "a", description: "Keyboard", quantity: 2, receivedQty: 0, serialized: false, productId: "pa" },
    { id: "b", description: "Handset", quantity: 3, receivedQty: 1, serialized: true, productId: "pb" },
    { id: "c", description: "Already here", quantity: 1, receivedQty: 1, serialized: false, productId: "pc" },
    { id: "d", description: "Free-text cable", quantity: 4, receivedQty: 0, serialized: false, productId: null },
  ];

  it("'Everything arrived' books in everything still owed, and nothing for a finished line", () => {
    const quantities = bookInQuantities(lines, "all", {});
    expect(quantities).toEqual({ a: 2, b: 2, d: 4 });
    expect(bookInCount(quantities)).toBe(8);
  });

  it("'Something is missing' takes the steppers, never more than owed or less than nothing", () => {
    expect(bookInQuantities(lines, "some", { a: 1, b: 9, d: -2 })).toEqual({ a: 1, b: 2, d: 0 });
  });

  it("asks for one serial per unit on a serialized line before it lets the delivery in", () => {
    const quantities = bookInQuantities(lines, "all", {});
    expect(bookInIssues(lines, quantities, { b: "SN1" })).toEqual(["Handset: 1 of 2 scanned. Scan one serial number per unit."]);
    expect(bookInIssues(lines, quantities, { b: "SN1\nSN2" })).toEqual([]);
    expect(bookInIssues(lines, { a: 0, b: 0, d: 0 }, {})).toEqual(["Nothing to book in: set how many arrived."]);
  });

  it("offers labels for what came and 'order the rest' for what did not", () => {
    const result = bookInResult(lines, { a: 2, b: 1, d: 0 });
    expect(result.items).toBe(3);
    expect(result.labels).toEqual([
      { productId: "pa", name: "Keyboard", count: 2 },
      { productId: "pb", name: "Handset", count: 1 },
    ]);
    expect(result.missing).toEqual([
      { productId: "pb", name: "Handset", count: 1 },
      { productId: null, name: "Free-text cable", count: 4 },
    ]);
    expect(orderTheRestHref(result.missing)).toBe(`/inventory/purchase-orders/new?add=${encodeURIComponent("pb:1")}`);
    expect(orderTheRestHref([{ productId: null, name: "x", count: 1 }])).toBeNull();
  });

  it("counts scans in words", () => {
    expect(serialCountWords(2, 5)).toBe("2 of 5 scanned");
    expect(serialCountWords(5, 5)).toBe("All 5 scanned");
    expect(serialCountWords(6, 5)).toBe("6 scanned, only 5 are needed");
  });
});

// ---------------------------------------------------------------------------
// Restock
// ---------------------------------------------------------------------------

describe("restock: order all low items", () => {
  const vendor = (id: string, name: string, active = true) => ({ id, name, active });
  const low = (over: Partial<LowProduct>): LowProduct => ({
    id: "p",
    name: "Part",
    stockQty: 1,
    lowStockAt: 3,
    reorderQty: null,
    costCents: 500,
    vendorId: "v1",
    vendor: vendor("v1", "Meridian"),
    ...over,
  });

  it("makes one draft's worth of lines per supplier at the suggested quantity and last cost", () => {
    const plan = planLowStockOrders(
      [
        low({ id: "a", name: "Screen", reorderQty: 10 }),
        low({ id: "b", name: "Battery", vendorId: "v2", vendor: vendor("v2", "Lone Star"), costCents: null }),
        low({ id: "c", name: "Port", stockQty: 0, lowStockAt: 2 }),
      ],
      [],
    );
    expect(plan.groups).toEqual([
      { vendorId: "v2", vendorName: "Lone Star", lines: [{ productId: "b", description: "Battery", quantity: 5, unitCostCents: 0 }] },
      {
        vendorId: "v1",
        vendorName: "Meridian",
        lines: [
          { productId: "a", description: "Screen", quantity: 10, unitCostCents: 500 },
          { productId: "c", description: "Port", quantity: 4, unitCostCents: 500 },
        ],
      },
    ]);
  });

  it("leaves out what is already coming, and what has no (active) supplier to send it", () => {
    const plan = planLowStockOrders(
      [low({ id: "coming" }), low({ id: "none", vendorId: null, vendor: null }), low({ id: "retired", vendor: vendor("v1", "Meridian", false) })],
      [{ productId: "coming", quantity: 5, receivedQty: 2 }],
    );
    expect(plan.groups).toEqual([]);
    expect(plan.alreadyOrdered.map((p) => p.id)).toEqual(["coming"]);
    expect(plan.noSupplier.map((p) => p.id)).toEqual(["none", "retired"]);
    // A line that has fully arrived is not "coming".
    expect(onOrderByProduct([{ productId: "x", quantity: 2, receivedQty: 2 }]).size).toBe(0);
  });

  it("says what happened in words", () => {
    expect(lowStockResultWords({ orders: [{ vendorName: "Meridian", lines: 3 }], noSupplier: 1, alreadyOrdered: 2 })).toBe(
      "1 draft order is ready to check: Meridian (3 items). 2 already on order. 1 has no supplier set: order it with New order.",
    );
    expect(lowStockResultWords({ orders: [] })).toBe("No new orders were needed.");
  });

  it("'Order more' opens a new order with the item on it, for its own supplier when it has one", () => {
    expect(orderMoreHref({ id: "p1", vendorId: "v1", stockQty: 1, lowStockAt: 3, reorderQty: null })).toBe(
      "/inventory/purchase-orders/new?vendorId=v1&add=p1%3A5",
    );
    expect(orderMoreHref({ id: "p1", vendorId: null, stockQty: 0, lowStockAt: 3, reorderQty: 2 })).toBe("/inventory/purchase-orders/new?add=p1%3A2");
  });
});

// ---------------------------------------------------------------------------
// Small words
// ---------------------------------------------------------------------------

describe("small stock words", () => {
  it("reads a stock change as a result, not a sum", () => {
    expect(stockChangeWords(2, 3)).toEqual({ line: "2 → 3", change: "1 added" });
    expect(stockChangeWords(5, 3)).toEqual({ line: "5 → 3", change: "2 taken off" });
    expect(stockChangeWords(4, 4).change).toBe("No change");
  });

  it("knows the three label sizes and defaults to the sheet", () => {
    expect(asLabelSize("roll")).toBe("roll");
    expect(asLabelSize("small")).toBe("small");
    expect(asLabelSize(undefined)).toBe("sheet");
    expect(asLabelSize("huge")).toBe("sheet");
  });

  it("lets a shelf carry a picture chosen for one of its products, without changing groups that have none", () => {
    const [group] = inventoryGroups([
      { id: "a", name: "Mystery widget", category: "Odd shelf", stockQty: 1 },
      { id: "b", name: "Other widget", category: "Odd shelf", stockQty: 2, catalogImage: "wall-charger" },
    ]);
    expect(group).toMatchObject({ key: "category:Odd shelf", quantity: 3, chosenImage: "wall-charger" });
    const [plain] = inventoryGroups([{ id: "c", name: "Mystery widget", category: "Odd shelf", stockQty: 1 }]);
    expect(plain).not.toHaveProperty("chosenImage");
  });
});
