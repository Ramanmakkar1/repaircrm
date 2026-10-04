import { beforeEach, describe, expect, it, vi } from "vitest";

import { calcTotals } from "@/lib/money";
import { calls, callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ userId: "user_1", shopId: "shop_1", role: "OWNER", name: "Olive" })),
}));
vi.mock("@/lib/events", () => ({ emitInvoiceEvent: vi.fn(async () => {}), emitPaymentEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/location", () => ({ newRecordLocationId: vi.fn(async () => null) }));
vi.mock("@/lib/warranty", () => ({ warrantyDaysByProduct: vi.fn(async () => new Map()) }));
vi.mock("@/components/billing/queries", () => ({
  resolveDocumentTax: vi.fn(async () => ({ taxRateId: "tx1", taxRateBps: 825 })),
}));
vi.mock("@/lib/serials", () => ({
  SerialError: class SerialError extends Error {},
  markInvoiceSerialsSold: vi.fn(async () => []),
  releaseInvoiceSerials: vi.fn(async () => []),
  syncSerializedStock: vi.fn(async () => {}),
}));

const { createInvoiceAction } = await import("@/app/(app)/invoices/actions");
const flow = await import("@/components/billing/bill/flow");
const { chargeLine, parseChargeIds, CHARGES_ALREADY_BILLED } = await import("@/components/billing/repair-charges");

import type { BillContext } from "@/components/billing/bill/flow";
import type { RepairCharge } from "@/components/billing/repair-charges";

/**
 * "From repair" on a new invoice puts the repair's unbilled charges on the bill
 * and, when the invoice is saved, marks exactly those charges billed in the
 * same transaction, so the repair's own Make invoice button can never bill them
 * a second time. A charge already on another invoice is never offered, and a
 * race is refused rather than half-billed.
 */

const SHOP = "shop_1";

const CHARGES: RepairCharge[] = [
  { id: "ch_screen", productId: "p_scr", description: "iPhone 14 screen", quantity: 1, unitPriceCents: 18_900, taxable: true },
  { id: "ch_labour", productId: null, description: "Screen fitting", quantity: 1, unitPriceCents: 4_500, taxable: false },
];

const ctx: BillContext = {
  kind: "invoice",
  customers: [{ id: "c1", label: "Amara Nwosu", taxRateId: "tx1", taxRateBps: 825, taxExempt: false }],
  products: [{ id: "p_case", name: "Silicone case", sku: "ACC-1", priceCents: 2_499, taxable: true, category: "Cases" }],
  taxRates: [{ id: "tx1", name: "Texas sales tax", rateBps: 825, isDefault: true, active: true }],
  taxRateBps: 825,
  repairs: [
    { id: "t1", number: 1015, subject: "Cracked screen", customerId: "c1", status: "In Progress", charges: CHARGES },
    { id: "t2", number: 1016, subject: "Battery", customerId: "c1", status: "New", charges: [] },
  ],
  recentCustomerIds: [],
};

describe("linkRepair: the repair's unbilled charges come onto the bill", () => {
  it("adds every charge as its own line, exactly as Make invoice writes it", () => {
    const start = flow.initialBillState(ctx, { customerId: "c1" });
    const linked = flow.linkRepair(start, "t1", ctx);
    expect(linked.ticketId).toBe("t1");
    expect(linked.lines.map((line) => line.chargeId)).toEqual(["ch_screen", "ch_labour"]);
    expect(linked.lines.map((line) => ({ ...chargeLine({ ...line, id: "" }) }))).toEqual(CHARGES.map(chargeLine));
  });

  it("never adds a charge twice, and keeps hand-added lines when the repair changes", () => {
    const start = flow.addProduct(flow.initialBillState(ctx, { customerId: "c1" }), ctx.products[0], "invoice");
    const once = flow.linkRepair(start, "t1", ctx);
    const twice = flow.linkRepair(once, "t1", ctx);
    expect(twice.lines).toHaveLength(3);
    // Switching to another repair takes the first one's charges off again.
    const other = flow.linkRepair(twice, "t2", ctx);
    expect(other.lines.map((line) => line.description)).toEqual(["Silicone case"]);
    // Unlinking ("Not for a repair") does the same.
    expect(flow.linkRepair(twice, "", ctx).lines.map((line) => line.description)).toEqual(["Silicone case"]);
  });

  it("keeps a tapped product off a charge line, so a sale never inflates a repair charge", () => {
    const withCase = { ...ctx, products: [{ ...ctx.products[0], id: "p_scr", priceCents: 18_900, name: "iPhone 14 screen" }] };
    const linked = flow.linkRepair(flow.initialBillState(withCase, { customerId: "c1" }), "t1", withCase);
    const tapped = flow.addProduct(linked, withCase.products[0], "invoice");
    expect(tapped.lines.find((line) => line.chargeId === "ch_screen")?.quantity).toBe(1);
    expect(tapped.lines).toHaveLength(3);
  });

  it("lets go of the repair and its charges when the bill moves to someone else", () => {
    const linked = flow.linkRepair(flow.initialBillState(ctx, { customerId: "c1" }), "t1", ctx);
    const moved = flow.withCustomer(linked, "c2", ctx);
    expect(moved.ticketId).toBe("");
    expect(moved.lines).toHaveLength(0);
  });

  it("brings the charges along when the page was opened for the repair", () => {
    const state = flow.initialBillState(ctx, { customerId: "c1", ticketId: "t1", withRepairCharges: true });
    expect(flow.billedChargeIds(state)).toEqual(["ch_screen", "ch_labour"]);
  });

  it("totals the same to the cent as the repair's Make invoice", () => {
    const state = flow.linkRepair(flow.initialBillState(ctx, { customerId: "c1" }), "t1", ctx);
    const viaBuilder = flow.totalsOf(state, "invoice");
    // makeInvoiceAction: the same lines, at the customer's own rate.
    const viaMakeInvoice = calcTotals(CHARGES.map(chargeLine), 825);
    expect(viaBuilder).toEqual(viaMakeInvoice);
    expect(viaBuilder.totalCents).toBe(18_900 + 4_500 + Math.round((18_900 * 825) / 10_000));
  });
});

describe("what the form posts", () => {
  it("posts the charge ids of the lines still on the bill, for an invoice only", () => {
    const linked = flow.linkRepair(flow.initialBillState(ctx, { customerId: "c1" }), "t1", ctx);
    const withoutLabour = flow.removeLine(linked, linked.lines[1].key);
    const posted = Object.fromEntries(flow.fieldEntries(withoutLabour, ctx));
    expect(JSON.parse(posted.ticketChargeIds)).toEqual(["ch_screen"]);
    expect(posted.ticketId).toBe("t1");
    // A quote lists the charges but never bills them.
    const quote = Object.fromEntries(flow.fieldEntries(linked, { ...ctx, kind: "estimate" }));
    expect(quote.ticketChargeIds).toBeUndefined();
    // No repair, no field: the old form's fields are untouched.
    const plain = flow.fieldEntries(flow.initialBillState(ctx, { customerId: "c1" }), ctx).map(([name]) => name);
    expect(plain).toEqual(["customerId", "date", "taxRateId", "notes", "lines"]);
  });

  it("reads the ids back strictly", () => {
    expect(parseChargeIds(null)).toEqual({ ok: true, ids: [] });
    expect(parseChargeIds('["a","a","b"]')).toEqual({ ok: true, ids: ["a", "b"] });
    expect(parseChargeIds("not json").ok).toBe(false);
    expect(parseChargeIds('[1,2]').ok).toBe(false);
  });
});

describe("createInvoiceAction marks exactly those charges billed, once", () => {
  function form(entries: Record<string, string>): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries(entries)) data.append(name, value);
    return data;
  }
  const LINES = JSON.stringify(CHARGES.map((charge) => ({ ...chargeLine(charge), serial: null })));

  beforeEach(() => {
    resetDb();
    handlers["customer.findFirst"] = (args) => {
      const where = args.where as { id?: string; shopId?: string };
      return where.shopId === SHOP && where.id === "c1" ? { id: "c1" } : null;
    };
    handlers["ticket.findFirst"] = (args) => {
      const where = args.where as { id?: string; shopId?: string };
      return where.shopId === SHOP && where.id === "t1" ? { id: "t1" } : null;
    };
    handlers["invoice.aggregate"] = () => ({ _max: { number: 1020 } });
    handlers["invoice.create"] = () => ({ id: "inv_new", number: 1021 });
  });

  it("stamps the charges in the invoice's own transaction, guarded by shop, repair and invoiceId: null", async () => {
    handlers["ticketCharge.updateMany"] = () => ({ count: 2 });
    await expect(
      createInvoiceAction(
        { error: null },
        form({ customerId: "c1", ticketId: "t1", lines: LINES, ticketChargeIds: JSON.stringify(["ch_screen", "ch_labour"]) }),
      ),
    ).rejects.toThrow("REDIRECT:/invoices/inv_new");

    const [stamp] = callsTo("ticketCharge.updateMany");
    expect(stamp.args.where).toEqual({ id: { in: ["ch_screen", "ch_labour"] }, shopId: SHOP, ticketId: "t1", invoiceId: null });
    expect(stamp.args.data).toEqual({ invoiceId: "inv_new" });
    // Inside the transaction that wrote the invoice, right after the invoice.
    const paths = calls.map((call) => call.path);
    const lastTransaction = paths.lastIndexOf("$transaction");
    expect(paths.indexOf("invoice.create")).toBeGreaterThan(lastTransaction);
    expect(paths.indexOf("ticketCharge.updateMany")).toBeGreaterThan(paths.indexOf("invoice.create"));
  });

  it("refuses the whole save when a charge was billed meanwhile, so nothing is billed twice", async () => {
    // Make invoice on the repair got one of them first.
    handlers["ticketCharge.updateMany"] = () => ({ count: 1 });
    const result = await createInvoiceAction(
      { error: null },
      form({ customerId: "c1", ticketId: "t1", lines: LINES, ticketChargeIds: JSON.stringify(["ch_screen", "ch_labour"]) }),
    );
    expect(result.error).toBe(CHARGES_ALREADY_BILLED);
  });

  it("will not bill charges without their repair", async () => {
    const result = await createInvoiceAction(
      { error: null },
      form({ customerId: "c1", lines: LINES, ticketChargeIds: JSON.stringify(["ch_screen"]) }),
    );
    expect(result.error).toMatch(/Pick the repair again/);
    expect(callsTo("invoice.create")).toEqual([]);
  });

  it("touches no charge at all when none were posted (the old form)", async () => {
    await expect(
      createInvoiceAction({ error: null }, form({ customerId: "c1", ticketId: "t1", lines: LINES })),
    ).rejects.toThrow("REDIRECT:/invoices/inv_new");
    expect(callsTo("ticketCharge.updateMany")).toEqual([]);
  });
});
