import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

/**
 * The counter's money path from a repair, at the server:
 *
 *   Make invoice -> "Create & take payment" -> the invoice opens with the
 *   payment up -> paid in full -> Hand over now.
 *
 * Pricing stays on the server (makeInvoiceAction reads the charges and the
 * clock itself) and payment stays recordPayment's; what is new is where each
 * step lands and the rules around it, which are tested here.
 */

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
const session = vi.hoisted(() => ({ userId: "user_1", shopId: "shop_1", role: "FRONT_DESK", name: "Fran" }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => session) }));
vi.mock("@/lib/events", () => ({ emitTicketEvent: vi.fn(async () => {}), emitInvoiceEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/location", () => ({ newRecordLocationId: vi.fn(async () => null), validLocationId: vi.fn() }));
vi.mock("@/lib/warranty", () => ({ warrantyDaysByProduct: vi.fn(async () => new Map()) }));
vi.mock("@/lib/deposits", () => ({ applyTicketDeposits: vi.fn(async () => ({ amountCents: 0 })) }));
vi.mock("@/lib/sequence", () => ({ withNextNumber: (_shop: string, _kind: string, fn: (n: number) => unknown) => fn(1016) }));
vi.mock("@/lib/comms", () => ({ sendEmail: vi.fn(async () => ({ ok: true, status: "sent" })), sendSms: vi.fn(async () => ({ ok: true, status: "sent" })) }));
vi.mock("@/components/billing/queries", () => ({
  resolveDocumentTax: vi.fn(async () => ({ taxRateId: "tx1", taxRateBps: 825 })),
}));

const { makeInvoiceAction, postUpdateAction, bulkTicketStatusAction, addChargeAction } = await import("@/app/(app)/tickets/actions");
const { invoicePrimaryAction } = await import("@/components/billing/primary-action");
const { labourTaxable, labourLinesFor, isLabourCharge } = await import("@/lib/time-billing");
const { readyReach, needsCustomerMessage, jobActions, jobActionCopy } = await import("@/components/tickets/job-screen-logic");
const { sortByUrgency } = await import("@/components/tickets/ticket-sort");
const { withAnswerFallback, repairWords } = await import("@/lib/portal-display");

const LABOUR_CHARGE = {
  id: "ch_lab",
  productId: "p_lab",
  description: "Thermal service",
  quantity: 1,
  unitPriceCents: 9_500,
  taxable: false,
  product: { category: "Labour" },
};

function seedRepair() {
  handlers["ticket.findFirst"] = () => ({ id: "t_1", number: 1015, customerId: "cus_1", charges: [LABOUR_CHARGE] });
  handlers["shop.findUnique"] = () => ({ settings: null, timezone: "UTC" });
  handlers["timeEntry.findMany"] = () => [
    { id: "te_1", seconds: 5_400, startedAt: new Date("2026-10-27T15:00:00Z"), user: { name: "Marcus" } },
  ];
  handlers["invoice.create"] = (args) => ({ id: "inv_new", number: 1016, data: args.data });
  handlers["ticketCharge.updateMany"] = () => ({ count: 1 });
  handlers["timeEntry.updateMany"] = () => ({ count: 1 });
  handlers["ticketComment.create"] = () => ({});
}

const redirectOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return String((error as Error).message).replace(/^REDIRECT:/, "");
  }
  return null;
};

beforeEach(() => {
  resetDb();
  session.role = "FRONT_DESK";
});

describe("Make invoice from a repair", () => {
  it("Create & take payment lands on the invoice with the payment open", async () => {
    seedRepair();
    expect(await redirectOf(makeInvoiceAction("t_1", { includeTime: false, takePayment: true }))).toBe("/invoices/inv_new?from=repair&pay=1");
  });

  it("plain Create invoice still marks it as made at the counter, without opening the payment", async () => {
    seedRepair();
    expect(await redirectOf(makeInvoiceAction("t_1", { includeTime: false }))).toBe("/invoices/inv_new?from=repair");
  });

  it("bills only the flat labour when the time is left unticked, and parks the time as not billable", async () => {
    seedRepair();
    await redirectOf(makeInvoiceAction("t_1", { includeTime: false, takePayment: true }));
    const lines = (callsTo("invoice.create")[0].args.data as { lines: { create: { unitPriceCents: number }[] } }).lines.create;
    expect(lines.map((line) => line.unitPriceCents)).toEqual([9_500]);
    expect(callsTo("timeEntry.findMany")).toHaveLength(0);
    const parked = callsTo("timeEntry.updateMany")[0].args;
    expect(parked.where).toMatchObject({ shopId: "shop_1", ticketId: "t_1", invoiceId: null, billable: true });
    expect(parked.data).toEqual({ billable: false });
  });

  it("taxes the logged labour the same way as the flat labour on the same bill", async () => {
    seedRepair();
    await redirectOf(makeInvoiceAction("t_1", { includeTime: true }));
    const lines = (callsTo("invoice.create")[0].args.data as { lines: { create: { taxable: boolean; productId: string | null }[] } }).lines.create;
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.taxable === false)).toBe(true);
  });

  it("refuses a technician, as data, before any query", async () => {
    session.role = "TECH";
    expect(await makeInvoiceAction("t_1", { takePayment: true })).toEqual({ error: "Only the owner or front desk can do that." });
    expect(callsTo("ticket.findFirst")).toHaveLength(0);
    expect(await addChargeAction("t_1", {}, new FormData())).toEqual({ error: "Only the owner or front desk can do that." });
  });
});

describe("the invoice's one big button at the counter", () => {
  it("is Take payment for a draft opened from a repair, Send otherwise", () => {
    expect(invoicePrimaryAction({ status: "DRAFT", voided: false, canTakePayment: true, atCounter: true })).toBe("pay");
    expect(invoicePrimaryAction({ status: "DRAFT", voided: false, canTakePayment: true })).toBe("send");
    expect(invoicePrimaryAction({ status: "DRAFT", voided: false, canTakePayment: false, atCounter: true })).toBe("send");
  });
});

describe("labour tax, one rule", () => {
  it("follows the shop's setting, then the labour already on the bill, then taxes", () => {
    expect(labourTaxable({ labourTaxable: false }, [{ description: "Parts", taxable: true }])).toBe(false);
    expect(labourTaxable(null, [{ description: "Screen replacement labour", taxable: false }])).toBe(false);
    expect(labourTaxable(null, [{ description: "Fitting", taxable: false, product: { category: "Labour" } }])).toBe(false);
    expect(labourTaxable(null, [{ description: "iPhone 14 screen", taxable: false }])).toBe(true);
    expect(labourTaxable(null)).toBe(true);
    const lines = labourLinesFor([{ id: "te", seconds: 3_600, startedAt: new Date(0), userName: "M" }], { rateCents: 9_500, roundingMinutes: 15 }, "UTC", false);
    expect(lines[0]).toMatchObject({ unitPriceCents: 9_500, taxable: false });
    expect(isLabourCharge({ description: "Labour, 1 hour" })).toBe(true);
    expect(isLabourCharge({ description: "Battery" })).toBe(false);
  });
});

describe("the repair's money-aware button", () => {
  it("takes the balance by name and never hands over unpaid as the big button", () => {
    const due = jobActions({ status: "Ready for Pickup", pickedUp: false, unbilled: false, invoice: { status: "SENT" }, money: { kind: "due", dueCents: 12_000 } });
    expect(due).toEqual({ primary: "payment", secondary: "handover-anyway" });
    expect(jobActionCopy("payment", { dueCents: 12_000 }).label).toBe("Take payment $120.00");
    expect(jobActions({ status: "Ready for Pickup", pickedUp: false, unbilled: false, invoice: { status: "PAID" }, money: { kind: "paid", dueCents: 0 } }))
      .toEqual({ primary: "handover", secondary: "view-invoice" });
  });

  it("offers a technician no money step at all", () => {
    expect(jobActions({ status: "Ready for Pickup", pickedUp: false, unbilled: true, invoice: null, seesMoney: false })).toEqual({ primary: null, secondary: null });
    expect(jobActions({ status: "Resolved", pickedUp: false, unbilled: true, invoice: null, seesMoney: false })).toEqual({ primary: "reopen", secondary: null });
  });
});

describe("telling the customer it is ready", () => {
  const on = { sms: true, email: true };
  const base = { smsOptIn: false, emailOptIn: false, mobile: null, email: null, phone: null };

  it("texts or emails only with consent and messaging switched on", () => {
    expect(readyReach({ ...base, smsOptIn: true, mobile: "555-0101" }, on)).toEqual({ kind: "message", channel: "text", to: "555-0101" });
    expect(readyReach({ ...base, emailOptIn: true, email: "a@b.co" }, on)).toEqual({ kind: "message", channel: "email", to: "a@b.co" });
    expect(readyReach({ ...base, emailOptIn: true, email: "a@b.co" }, { sms: true, email: false })).toMatchObject({ kind: "call", reason: "messaging-off" });
  });

  it("says to call a customer who opted out, or who has no address", () => {
    expect(readyReach({ ...base, mobile: "555-0101", email: "a@b.co" }, on)).toEqual({ kind: "call", reason: "opted-out", phone: "555-0101" });
    expect(readyReach({ ...base, phone: "555-0199" }, on)).toEqual({ kind: "call", reason: "no-address", phone: "555-0199" });
  });
});

describe("Waiting on Customer needs a question the customer can read", () => {
  beforeEach(() => {
    handlers["ticket.findFirst"] = () => ({ id: "t_1", shopId: "shop_1", number: 1015, subject: "x", status: "In Progress", customerId: "cus_1", customer: { email: null, mobile: null, smsOptIn: false } });
  });
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it("refuses the move without a customer-facing message, as data", async () => {
    expect(needsCustomerMessage("Waiting on Customer", "In Progress")).toBe(true);
    expect(needsCustomerMessage("Waiting on Customer", "Waiting on Customer")).toBe(false);
    const refused = await postUpdateAction("t_1", {}, form({ status: "Waiting on Customer", body: "asked for passcode" }));
    expect(refused.error).toMatch(/message to the customer/);
    expect(callsTo("ticket.update")).toHaveLength(0);
  });

  it("refuses it in bulk", async () => {
    handlers["shop.findUnique"] = () => ({ settings: null });
    const result = await bulkTicketStatusAction(["t_1"], "Waiting on Customer");
    expect(result).toMatchObject({ ok: false });
  });

  it("the portal says to call when the shop wrote nothing", () => {
    const words = repairWords("Waiting on Customer");
    const fallback = withAnswerFallback(words, { shopMessage: false, shopName: "Fix It", phone: "555-0100" });
    expect(fallback).toMatchObject({ headline: "The shop needs to talk to you", next: "Please call Fix It on 555-0100.", callInstead: true });
    expect(withAnswerFallback(words, { shopMessage: true, shopName: "Fix It", phone: null }).headline).toBe("We need your answer");
  });
});

describe("open jobs, most urgent first", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, 28 + n));
  it("overdue, then due soonest, then priority, then ready last", () => {
    const rows = [
      { id: "ready", status: "Ready for Pickup", priority: "URGENT", dueDate: day(-5), createdAt: day(-9) },
      { id: "undated-low", status: "New", priority: "LOW", dueDate: null, createdAt: day(-1) },
      { id: "due-later", status: "In Progress", priority: "NORMAL", dueDate: day(3), createdAt: day(-2) },
      { id: "overdue", status: "In Progress", priority: "NORMAL", dueDate: day(-2), createdAt: day(-3) },
      { id: "undated-urgent", status: "New", priority: "URGENT", dueDate: null, createdAt: day(-4) },
      { id: "due-soon", status: "New", priority: "LOW", dueDate: day(1), createdAt: day(-1) },
    ];
    expect(sortByUrgency(rows).map((row) => row.id)).toEqual(["overdue", "due-soon", "due-later", "undated-urgent", "undated-low", "ready"]);
  });
});
