import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("@/lib/events", () => ({ emitCustomerEvent: vi.fn(async () => {}) }));
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/invoices/new" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => createElement("img", { alt: props.alt }) }));

const { DocumentForm } = await import("@/components/billing/document-form");
const { CUSTOM, draftsToPayload } = await import("@/components/billing/line-items-editor");
const flow = await import("@/components/billing/bill/flow");
const { parseLines } = await import("@/components/billing/types");
const { readQuickCustomer } = await import("@/lib/customers/quick-add");
const { calcTotals } = await import("@/lib/money");

import type { Draft, InitialLine } from "@/components/billing/line-items-editor";
import type { BillContext, BillKind, BillState } from "@/components/billing/bill/flow";
import type { CustomerOption, ProductOption } from "@/components/billing/types";
import type { TaxRateOption } from "@/lib/tax";

/**
 * The Easy-mode bill builder must post exactly what the old DocumentForm posted
 * (same field names, same `lines` encoding, same totals), whatever order the
 * choices were made in. The old form is rendered (first paint, Full mode) and
 * its fields read back; the builder's state is built with its own transitions;
 * the two are compared field for field. The server's own readers (parseLines,
 * readQuickCustomer) are then pointed at what the builder posts.
 */

const customers: CustomerOption[] = [
  { id: "c1", label: "Amara Nwosu", mobile: "(512) 555-0156", taxRateId: "tx1", taxRateBps: 825, taxExempt: false },
  { id: "c2", label: "Okonkwo Dental Group — Ray Okonkwo", phone: "(512) 555-0122", taxRateId: null, taxRateBps: 0, taxExempt: true },
  { id: "c3", label: "Elena Marquez", mobile: "512-555-0111", email: "elena@example.com", taxRateId: "tx2", taxRateBps: 675, taxExempt: false },
];
const taxRates: TaxRateOption[] = [
  { id: "tx1", name: "Texas sales tax", rateBps: 825, isDefault: true, active: true },
  { id: "tx2", name: "Williamson County", rateBps: 675, isDefault: false, active: true },
  { id: "tx3", name: "Old rate", rateBps: 500, isDefault: false, active: false },
];
const products: ProductOption[] = [
  { id: "p1", name: "Tempered Glass Protector", sku: "ACC-TG", priceCents: 2499, taxable: true, category: "Screen guards" },
  { id: "p2", name: "iPhone 14 Screen", sku: "SCR-IP14", priceCents: 18900, taxable: true, category: "Screens", serialized: true, serials: ["SN-100", "SN-101"] },
  { id: "p3", name: "USB-C Cable", sku: "CBL-C", priceCents: 1299, taxable: false, category: "Cables" },
];
const repairs = [
  { id: "t1", number: 1015, subject: "Cracked screen", customerId: "c1", status: "In Progress" },
  { id: "t2", number: 1016, subject: "Battery", customerId: "c3", status: "New" },
];

const context = (kind: BillKind, rates: TaxRateOption[] = taxRates): BillContext => ({
  kind,
  customers,
  products,
  taxRates: rates,
  taxRateBps: 825,
  repairs,
  recentCustomerIds: ["c3", "c1"],
});

// ---------------------------------------------------------------------------
// Reading the old form back
// ---------------------------------------------------------------------------

const decode = (text: string) => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attributes = (tag: string) => Object.fromEntries([...tag.matchAll(/\s([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], decode(match[2])]));

/**
 * The fields the old form posts, from its first paint: every named input and
 * textarea. The tax picker is a Radix select whose value is only filled in once
 * it is on screen, so only its NAME can be read here.
 */
function postedByOldForm(html: string): [string, string][] {
  const out: [string, string][] = [];
  for (const match of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.name) out.push([attrs.name, decode(match[2])]);
  }
  for (const match of html.matchAll(/<(input|select)\b([^>]*)>/g)) {
    const attrs = attributes(match[2]);
    if (!attrs.name) continue;
    out.push([attrs.name, match[1] === "select" ? "<chosen in the browser>" : (attrs.value ?? "")]);
  }
  return out;
}

const oldForm = (kind: BillKind, initial: Record<string, unknown>, rates: TaxRateOption[] = taxRates) =>
  postedByOldForm(
    renderToStaticMarkup(
      createElement(DocumentForm, {
        action: async () => ({ error: null }),
        kind,
        customers,
        products,
        taxRateBps: 825,
        taxRates: rates,
        initial,
        submitLabel: "Create",
        cancelHref: "/x",
        simple: false,
      } as never),
    ),
  );

/** What the builder posts, with the tax picker's value hidden the same way. */
function builderPosts(state: BillState, ctx: BillContext): [string, string][] {
  return flow.fieldEntries(state, ctx).map(([name, value]) => [name, name === "taxRateId" ? "<chosen in the browser>" : value]);
}

const byName = (entries: [string, string][]) => [...entries].sort((a, b) => a[0].localeCompare(b[0]));

// ---------------------------------------------------------------------------
// Three sample documents, built the way each UI builds them
// ---------------------------------------------------------------------------

describe("what the builder posts is what the old form posted", () => {
  it("1: an invoice for a prefilled customer, repair link, products, a unit, a one-off, due date and notes", () => {
    const ctx = context("invoice");
    const notes = "Call before pickup\nThank you";
    const oldLines: InitialLine[] = [
      { productId: "p1", description: "Tempered Glass Protector", quantity: 2, unitPriceCents: 2499, taxable: true, serial: null },
      { productId: "p2", description: "iPhone 14 Screen", quantity: 1, unitPriceCents: 18900, taxable: true, serial: "SN-100" },
      { productId: null, description: "Bench fee", quantity: 1, unitPriceCents: 2000, taxable: false, serial: null },
    ];
    const before = oldForm("invoice", { customerId: "c1", ticketId: "t1", date: "2026-10-15", notes, lines: oldLines });

    let state = flow.initialBillState(ctx, { customerId: "c1", ticketId: "t1" });
    state = flow.addProduct(state, products[0], "invoice");
    state = flow.addProduct(state, products[0], "invoice"); // tap again: one more, not a second row
    state = flow.addProduct(state, products[1], "invoice", "SN-100");
    state = flow.addOneOff(state, { description: " Bench fee ", unitPriceCents: 2000, taxable: false });
    state = { ...state, date: "2026-10-15", notes };

    expect(byName(builderPosts(state, ctx))).toEqual(byName(before));
    // And it is the FormData the server action receives, entry for entry.
    expect([...flow.toFormData(state, ctx).entries()]).toEqual(flow.fieldEntries(state, ctx));
    // The one thing the old picker only knew in the browser: the rate it posts.
    expect(flow.fieldEntries(state, ctx).find(([name]) => name === "taxRateId")).toEqual(["taxRateId", "tx1"]);
  });

  it("2: an estimate for a tax-exempt customer in a shop with no named rates (no tax field, no serials)", () => {
    const ctx = context("estimate", []);
    const oldLines: InitialLine[] = [
      { productId: "p1", description: "Tempered Glass Protector", quantity: 1, unitPriceCents: 2499, taxable: true, serial: null },
      { productId: "p3", description: "USB-C Cable", quantity: 3, unitPriceCents: 1299, taxable: false, serial: "ignored" },
    ];
    const before = oldForm("estimate", { customerId: "c2", lines: oldLines }, []);

    let state = flow.initialBillState(ctx, { customerId: "c2" });
    state = flow.addProduct(state, products[0], "estimate");
    for (let tap = 0; tap < 3; tap++) state = flow.addProduct(state, products[2], "estimate");
    // The estimate has no serial column: whatever a line carried is never posted.
    state = flow.updateLine(state, state.lines[1].key, { serial: "ignored" });

    expect(byName(builderPosts(state, ctx))).toEqual(byName(before));
    expect(flow.fieldEntries(state, ctx).map(([name]) => name)).not.toContain("taxRateId");
    expect(state.taxRateBps).toBe(0); // exempt: no tax under the lines either
  });

  it("3: an invoice with an edited price and wording, a typed serial on a one-off, and a different tax rate", () => {
    const ctx = context("invoice");
    const oldLines: InitialLine[] = [
      { productId: "p3", description: "USB-C Cable (braided)", quantity: 5, unitPriceCents: 1100, taxable: true, serial: null },
      { productId: null, description: "Data recovery", quantity: 1, unitPriceCents: 9500, taxable: true, serial: "DR-9" },
    ];
    const before = oldForm("invoice", { customerId: "c3", lines: oldLines });

    let state = flow.initialBillState(ctx, { customerId: "c3" });
    for (let tap = 0; tap < 5; tap++) state = flow.addProduct(state, products[2], "invoice");
    state = flow.updateLine(state, state.lines[0].key, { description: "USB-C Cable (braided)", unitPriceCents: 1100, taxable: true });
    state = flow.addOneOff(state, { description: "Data recovery", unitPriceCents: 9500, taxable: true });
    state = flow.updateLine(state, state.lines[1].key, { serial: "DR-9" });
    state = flow.withTax(state, "tx2", ctx);

    expect(byName(builderPosts(state, ctx))).toEqual(byName(before));
    expect(flow.fieldEntries(state, ctx).find(([name]) => name === "taxRateId")).toEqual(["taxRateId", "tx2"]);
  });

  it("posts 'no tax' as the same sentinel the old picker did", () => {
    const ctx = context("invoice");
    const state = flow.withTax(flow.initialBillState(ctx, { customerId: "c1" }), null, ctx);
    expect(flow.fieldEntries(state, ctx).find(([name]) => name === "taxRateId")).toEqual(["taxRateId", "none"]);
    expect(state.taxRateBps).toBe(0);
  });
});

describe("the new-customer fields", () => {
  beforeEach(() => resetDb());

  it("posts customerId=new and the same newCustomer* names the combobox did, in the same order", () => {
    const ctx = context("invoice");
    let state = flow.initialBillState(ctx);
    state = flow.withCustomer(state, flow.NEW, ctx);
    state = { ...state, newCustomer: { name: "Sam Lee", phone: "512 555 0142", email: "", smsOk: true } };
    state = flow.addOneOff(state, { description: "Bench fee", unitPriceCents: 2000, taxable: true });
    const names = flow.fieldEntries(state, ctx).map(([name]) => name);
    expect(names).toEqual(["customerId", "newCustomerName", "newCustomerPhone", "newCustomerEmail", "newCustomerSmsOk", "date", "taxRateId", "notes", "lines"]);
    expect(flow.fieldEntries(state, ctx).slice(0, 5)).toEqual([
      ["customerId", "new"],
      ["newCustomerName", "Sam Lee"],
      ["newCustomerPhone", "512 555 0142"],
      ["newCustomerEmail", ""],
      ["newCustomerSmsOk", "on"],
    ]);
  });

  it("the server's own reader takes it: a name or a number is enough, texts only with a number", () => {
    const ctx = context("invoice");
    const base = flow.withCustomer(flow.initialBillState(ctx), flow.NEW, ctx);

    const phoneOnly = { ...base, newCustomer: { name: "", phone: "780 555 0142", email: "", smsOk: true } };
    expect(readQuickCustomer(flow.toFormData(phoneOnly, ctx))).toEqual({
      ok: true,
      customer: { firstName: "Customer", lastName: "780 555 0142", phone: "780 555 0142", email: null, smsOk: true },
    });

    const nameOnly = { ...base, newCustomer: { name: "Sam Lee", phone: "", email: "", smsOk: true } };
    expect(flow.fieldEntries(nameOnly, ctx).map(([name]) => name)).not.toContain("newCustomerSmsOk");
    expect(readQuickCustomer(flow.toFormData(nameOnly, ctx))).toMatchObject({ ok: true, customer: { firstName: "Sam", lastName: "Lee", smsOk: false } });

    expect(readQuickCustomer(flow.toFormData(base, ctx))).toEqual({ ok: false, error: "Add the new customer's name or phone number." });
  });

  it("an existing customer is not a quick customer", () => {
    const ctx = context("invoice");
    expect(readQuickCustomer(flow.toFormData(flow.initialBillState(ctx, { customerId: "c1" }), ctx))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

describe("lines are encoded the way the old line editor encoded them", () => {
  const drafts: Draft[] = [
    { key: "a", productId: "p1", description: "  Tempered Glass Protector ", quantity: "2", unitPrice: "24.99", taxable: true, serial: "" },
    { key: "b", productId: CUSTOM, description: "Bench fee", quantity: "1", unitPrice: "20.00", taxable: false, serial: "  AB-1 " },
    { key: "c", productId: "p2", description: "iPhone 14 Screen", quantity: "1", unitPrice: "189.00", taxable: true, serial: "SN-100" },
    { key: "d", productId: CUSTOM, description: "", quantity: "1", unitPrice: "0.00", taxable: true, serial: "" }, // a row nobody filled in is dropped
    { key: "e", productId: CUSTOM, description: "Discount", quantity: "1", unitPrice: "-5.00", taxable: true, serial: "" },
  ];
  const lines = [
    { key: "1", productId: "p1", description: "Tempered Glass Protector", quantity: 2, unitPriceCents: 2499, taxable: true, serial: "" },
    { key: "2", productId: null, description: "Bench fee", quantity: 1, unitPriceCents: 2000, taxable: false, serial: "AB-1" },
    { key: "3", productId: "p2", description: "iPhone 14 Screen", quantity: 1, unitPriceCents: 18900, taxable: true, serial: "SN-100" },
    { key: "4", productId: null, description: "Discount", quantity: 1, unitPriceCents: -500, taxable: true, serial: "" },
  ];

  it.each(["invoice", "estimate"] as const)("%s: same payload, same totals", (kind) => {
    const oldPayload = draftsToPayload(drafts, kind === "invoice");
    expect(flow.toPayload(lines, kind)).toEqual(oldPayload);
    const state = { ...flow.initialBillState(context(kind), {}), lines, taxRateBps: 825 };
    expect(flow.totalsOf(state, kind)).toEqual(calcTotals(oldPayload, 825));
  });

  it("what it posts passes the server's own line parser, unchanged", () => {
    const ctx = context("invoice");
    const state = { ...flow.initialBillState(ctx, { customerId: "c1" }), lines };
    const parsed = parseLines(flow.toFormData(state, ctx).get("lines"));
    expect(parsed).toEqual({ ok: true, lines: flow.toPayload(lines, "invoice") });
  });

  it("an empty bill is refused by the server's parser with the same message the form showed", () => {
    const ctx = context("invoice");
    expect(parseLines(flow.toFormData(flow.initialBillState(ctx, { customerId: "c1" }), ctx).get("lines"))).toEqual({ ok: false, error: "Add at least one line item" });
  });
});

describe("tapping products", () => {
  const ctx = context("invoice");
  const start = () => flow.initialBillState(ctx, { customerId: "c1" });

  it("adds a line, and a second tap on the same product is one more, not a second row", () => {
    let state = flow.addProduct(start(), products[0], "invoice");
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]).toMatchObject({ productId: "p1", description: "Tempered Glass Protector", quantity: 1, unitPriceCents: 2499, taxable: true, serial: "" });
    state = flow.addProduct(state, products[0], "invoice");
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].quantity).toBe(2);
    expect(flow.productQuantity(state, "p1")).toBe(2);
  });

  it("a product whose price was edited gets its own row on the next tap", () => {
    let state = flow.addProduct(start(), products[0], "invoice");
    state = flow.updateLine(state, state.lines[0].key, { unitPriceCents: 2000 });
    state = flow.addProduct(state, products[0], "invoice");
    expect(state.lines.map((line) => [line.unitPriceCents, line.quantity])).toEqual([[2000, 1], [2499, 1]]);
  });

  it("a serialized product on an invoice is one unit per line and needs a unit first", () => {
    expect(flow.needsUnit(products[1], "invoice")).toBe(true);
    expect(flow.needsUnit(products[1], "estimate")).toBe(false);
    expect(flow.needsUnit(products[0], "invoice")).toBe(false);
    expect(flow.addProduct(start(), products[1], "invoice").lines).toHaveLength(0); // no unit chosen: nothing added
    let state = flow.addProduct(start(), products[1], "invoice", "SN-100");
    state = flow.addProduct(state, products[1], "invoice", "SN-101");
    state = flow.addProduct(state, products[1], "invoice", "SN-100"); // already on the bill
    expect(state.lines.map((line) => [line.serial, line.quantity])).toEqual([["SN-100", 1], ["SN-101", 1]]);
    expect(flow.availableUnits(products[1], state)).toEqual([]);
    expect(flow.availableUnits(products[1], state, state.lines[0].key)).toEqual(["SN-100"]); // a line's own unit stays choosable
    expect(flow.isUnitLine(state.lines[0], "invoice", products)).toBe(true);
  });

  it("an estimate quotes the product with no unit, and a serial scanned for it is dropped", () => {
    const estimate = flow.initialBillState(context("estimate"), { customerId: "c1" });
    const state = flow.addProduct(flow.addProduct(estimate, products[1], "estimate", "SN-100"), products[1], "estimate");
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]).toMatchObject({ quantity: 2, serial: "" });
  });

  it("stepping to zero takes the line off, and the quantity never passes what the server allows", () => {
    let state = flow.addProduct(start(), products[0], "invoice");
    const key = state.lines[0].key;
    expect(flow.setQuantity(state, key, 5).lines[0].quantity).toBe(5);
    expect(flow.setQuantity(state, key, 999_999).lines[0].quantity).toBe(flow.MAX_QUANTITY);
    state = flow.setQuantity(state, key, 0);
    expect(state.lines).toEqual([]);
  });

  it("a one-off item is a line with no product, and a minus price is a discount", () => {
    const state = flow.addOneOff(start(), { description: "  Discount ", unitPriceCents: -500, taxable: false });
    expect(state.lines[0]).toMatchObject({ productId: null, description: "Discount", quantity: 1, unitPriceCents: -500, taxable: false });
    expect(flow.totalsOf(state, "invoice").totalCents).toBe(-500);
  });

  it("each new line gets its own key, even after another was removed", () => {
    let state = flow.addOneOff(start(), { description: "A", unitPriceCents: 100, taxable: true });
    state = flow.addOneOff(state, { description: "B", unitPriceCents: 100, taxable: true });
    state = flow.removeLine(state, state.lines[0].key);
    state = flow.addOneOff(state, { description: "C", unitPriceCents: 100, taxable: true });
    expect(new Set(state.lines.map((line) => line.key)).size).toBe(2);
  });
});

describe("typed amounts", () => {
  it("reads a price the way the old price box did, and refuses what is not an amount", () => {
    expect(flow.parsePriceText("12.5")).toBe(1250);
    expect(flow.parsePriceText("$1,200")).toBe(120000);
    expect(flow.parsePriceText("-5.00")).toBe(-500);
    expect(flow.parsePriceText("0")).toBe(0);
    expect(flow.parsePriceText("")).toBeNull();
    expect(flow.parsePriceText("abc")).toBeNull();
    expect(flow.parsePriceText("1.2.3")).toBeNull();
    expect(flow.parsePriceText("1000001")).toBeNull(); // over the server's ceiling
  });

  it("reads a quantity as a whole number from 1 to 100,000", () => {
    expect(flow.parseQuantityText("3")).toBe(3);
    expect(flow.parseQuantityText(" 12 ")).toBe(12);
    for (const bad of ["", "0", "-1", "1.5", "two", "100001"]) expect(flow.parseQuantityText(bad)).toBeNull();
  });

  it("shows cents as the plain 219.00 a price box holds", () => {
    expect(flow.centsToInput(21900)).toBe("219.00");
    expect(flow.centsToInput(-500)).toBe("-5.00");
  });
});

// ---------------------------------------------------------------------------
// Customer and tax
// ---------------------------------------------------------------------------

describe("customer and tax", () => {
  it("a new document opens on the customer's rate, or the shop default, or the flat rate", () => {
    expect(flow.initialBillState(context("invoice"), { customerId: "c3" })).toMatchObject({ taxRateId: "tx2", taxRateBps: 675 });
    expect(flow.initialBillState(context("invoice"), { customerId: "c2" })).toMatchObject({ taxRateId: null, taxRateBps: 0 });
    expect(flow.initialBillState(context("invoice"), {})).toMatchObject({ taxRateId: "tx1", taxRateBps: 825 });
    expect(flow.initialBillState(context("invoice", []), {})).toMatchObject({ taxRateId: null, taxRateBps: 825 });
  });

  it("choosing someone re-prices the tax; clearing the choice leaves it alone", () => {
    const ctx = context("invoice");
    let state = flow.initialBillState(ctx, {});
    state = flow.withCustomer(state, "c2", ctx);
    expect(state).toMatchObject({ customerId: "c2", taxRateId: null, taxRateBps: 0 });
    state = flow.withCustomer(state, "", ctx);
    expect(state).toMatchObject({ customerId: "", taxRateBps: 0 });
    state = flow.withCustomer(state, "c3", ctx);
    expect(state).toMatchObject({ taxRateId: "tx2", taxRateBps: 675 });
  });

  it("a linked repair is let go when the bill is for somebody else", () => {
    const ctx = context("invoice");
    const linked = flow.withRepair(flow.initialBillState(ctx, { customerId: "c1" }), "t1");
    expect(flow.withCustomer(linked, "c3", ctx).ticketId).toBe("");
    expect(flow.withCustomer(linked, "c1", ctx).ticketId).toBe("t1");
    expect(flow.repairsFor(linked, ctx).map((repair) => repair.id)).toEqual(["t1"]);
    expect(flow.repairsFor(flow.initialBillState(ctx, {}), ctx)).toEqual([]);
    expect(flow.repairLabel(repairs[0])).toBe("Repair #1015 · Cracked screen");
  });

  it("offers the active rates, and a retired one only while the document is on it", () => {
    const ctx = context("invoice");
    expect(flow.taxChoices(ctx, "tx1").map((rate) => rate.id)).toEqual(["tx1", "tx2"]);
    expect(flow.taxChoices(ctx, "tx3").map((rate) => rate.id)).toEqual(["tx1", "tx2", "tx3"]);
  });

  it("names the tax in words", () => {
    const ctx = context("invoice");
    expect(flow.taxName(flow.initialBillState(ctx, { customerId: "c3" }), ctx)).toBe("Williamson County · 6.75%");
    expect(flow.taxName(flow.initialBillState(ctx, { customerId: "c2" }), ctx)).toBe("No tax");
    expect(flow.taxName(flow.initialBillState(context("invoice", []), {}), context("invoice", []))).toBe("8.25%");
  });

  it("the few people to tap are the recent ones in order, then whoever fills the row", () => {
    expect(flow.recentCustomers(customers, ["c3", "c1"], 2).map((customer) => customer.id)).toEqual(["c3", "c1"]);
    expect(flow.recentCustomers(customers, ["c3", "gone"], 3).map((customer) => customer.id)).toEqual(["c3", "c1", "c2"]);
    expect(flow.recentCustomers(customers, [], 2).map((customer) => customer.id)).toEqual(["c1", "c2"]);
  });

  it("searches by name and by phone, not by nothing", () => {
    expect(flow.matchCustomers(customers, "elena").map((customer) => customer.id)).toEqual(["c3"]);
    expect(flow.matchCustomers(customers, "555-0122").map((customer) => customer.id)).toEqual(["c2"]);
    expect(flow.matchCustomers(customers, "  ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// What is missing
// ---------------------------------------------------------------------------

describe("what stops a save, in plain words", () => {
  const ctx = context("invoice");

  it("needs a customer and at least one item, and says which", () => {
    const empty = flow.initialBillState(ctx, {});
    expect(flow.validate(empty, ctx).map((issue) => [issue.step, issue.message])).toEqual([
      [0, "Choose a customer or add a new one."],
      [1, "Add at least one item."],
    ]);
    expect(flow.submitReason(empty, ctx)).toBe("Choose a customer first.");
    const chosen = flow.initialBillState(ctx, { customerId: "c1" });
    expect(flow.submitReason(chosen, ctx)).toBe("Add at least one item first.");
    const ready = flow.addOneOff(chosen, { description: "Fee", unitPriceCents: 100, taxable: true });
    expect(flow.validate(ready, ctx)).toEqual([]);
    expect(flow.submitReason(ready, ctx)).toBeNull();
    expect(flow.blockerOf(ready, ctx)).toBeNull();
  });

  it("asks a new customer for a name or a number, and a sane email", () => {
    const adding = flow.withCustomer(flow.initialBillState(ctx, {}), flow.NEW, ctx);
    expect(flow.validate(adding, ctx)[0]).toEqual({ step: 0, message: "Add the new customer's name or phone number." });
    const typed = { ...adding, newCustomer: { name: "Sam", phone: "", email: "sam@", smsOk: true } };
    expect(flow.validate(typed, ctx)[0]).toEqual({ step: 0, message: "Enter a valid email address or leave it blank." });
    const fine = { ...adding, newCustomer: { name: "", phone: "512 555 0142", email: "", smsOk: true } };
    expect(flow.validate(fine, ctx).filter((issue) => issue.step === 0)).toEqual([]);
  });

  it("an invoice line for a serialized product must be one chosen unit; an estimate need not", () => {
    const withLine = (kind: BillKind) => ({
      ...flow.initialBillState(context(kind), { customerId: "c1" }),
      lines: [{ key: "x", productId: "p2", description: "iPhone 14 Screen", quantity: 1, unitPriceCents: 18900, taxable: true, serial: "" }],
    });
    expect(flow.validate(withLine("invoice"), ctx)).toEqual([{ step: 1, message: "Choose which unit of iPhone 14 Screen you are selling." }]);
    expect(flow.validate(withLine("estimate"), context("estimate"))).toEqual([]);
  });

  it("sends a refusal from the server to the step that can fix it", () => {
    expect(flow.stepForServerError("Choose a customer for this invoice, or add a new one.")).toBe(0);
    expect(flow.stepForServerError("Add the new customer's name or phone number.")).toBe(0);
    expect(flow.stepForServerError("That email doesn't look right — fix it or leave it blank.")).toBe(0);
    expect(flow.stepForServerError("Every line needs a description")).toBe(1);
    expect(flow.stepForServerError("Add at least one line item")).toBe(1);
    expect(flow.stepForServerError("Serial SN-100 is not in stock — pick another unit.")).toBe(1);
    expect(flow.stepForServerError("Something else went wrong.")).toBeNull();
  });
});

describe("the stepper, the panel and the bar say it in words", () => {
  const ctx = context("invoice");

  it("marks a step done only when it is", () => {
    const empty = flow.stepStatuses(flow.initialBillState(ctx, {}), ctx);
    expect(empty.map((status) => status.done)).toEqual([false, false, false]);
    let state = flow.initialBillState(ctx, { customerId: "c1" });
    state = flow.addProduct(flow.addProduct(state, products[0], "invoice"), products[0], "invoice");
    expect(flow.stepStatuses(state, ctx)).toEqual([
      { done: true, text: "Amara Nwosu" },
      { done: true, text: "2 items" },
      { done: false, text: "" },
    ]);
  });

  it("makes one line of it for the phone's bar", () => {
    const ctx2 = context("invoice");
    expect(flow.summaryLine(flow.initialBillState(ctx2, {}), ctx2)).toBe("No customer yet · No items yet");
    let state = flow.initialBillState(ctx2, { customerId: "c1" });
    state = flow.addProduct(state, products[0], "invoice");
    // 24.99 + 8.25% tax
    expect(flow.summaryLine(state, ctx2)).toBe("Amara Nwosu · 1 item · $27.05");
    // On the last step the Save button takes the room, so the name is left off.
    expect(flow.summaryLine(state, ctx2, false)).toBe("1 item · $27.05");
    expect(flow.summaryLine(flow.initialBillState(ctx2, {}), ctx2, false)).toBe("No items yet");
  });

  it("says invoice or estimate everywhere, and keeps the dates apart", () => {
    expect(flow.copyFor("invoice")).toMatchObject({ panel: "This invoice", save: "Save invoice", dateLabel: "Due date", dateEmpty: "Due on receipt", itemsTitle: "What are you billing?" });
    expect(flow.copyFor("estimate")).toMatchObject({ panel: "This estimate", save: "Save estimate", dateLabel: "Expires on", dateEmpty: "No expiry date", itemsTitle: "What are you quoting?" });
    expect(flow.stepTitle("estimate", 1).title).toBe("What are you quoting?");
    expect(flow.STEPS.map((step) => step.label)).toEqual(["Customer", "Items", "Review"]);
  });
});

describe("shelves and search", () => {
  it("groups products on the same shelves as Stock and the Sell screen", () => {
    const shelves = flow.shelvesOf(products);
    expect(shelves.map((shelf) => [shelf.key, shelf.count])).toEqual([
      ["screen-guards", 1],
      ["charging", 1],
      ["screens", 1],
    ]);
  });

  it("a search looks through everything; a shelf shows only its own", () => {
    expect(flow.filterProducts(products, { shelf: "screens", query: "" }).map((product) => product.id)).toEqual(["p2"]);
    expect(flow.filterProducts(products, { shelf: flow.ALL_SHELF, query: "" }).map((product) => product.id)).toEqual(["p2", "p1", "p3"].sort((a, b) => products.find((p) => p.id === a)!.name.localeCompare(products.find((p) => p.id === b)!.name)));
    expect(flow.filterProducts(products, { shelf: "screens", query: "cable" }).map((product) => product.id)).toEqual(["p3"]);
    expect(flow.filterProducts(products, { shelf: null, query: "scr-ip" }).map((product) => product.id)).toEqual(["p2"]);
  });

  it("a typed code that is exactly a SKU is that product", () => {
    expect(flow.matchProductCode(products, " acc-tg ")?.id).toBe("p1");
    expect(flow.matchProductCode(products, "ACC")).toBeNull();
    expect(flow.matchProductCode(products, "")).toBeNull();
  });
});
