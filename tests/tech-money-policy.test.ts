import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { calls, callsTo, handlers, resetDb } from "./helpers/db-mock";

/**
 * THE MONEY POLICY (lib/money-access.ts), enforced on the server.
 *
 *   OWNER and FRONT_DESK see money.
 *   TECH sees repairs, parts and stock quantities, and no prices, costs,
 *   balances, payments, invoices, estimates, POS, drawers or money print pages.
 *
 * Proven from the page functions themselves against the recording db fake: a
 * technician's request 404s before a money route runs a single query, and the
 * customer and repair pages never even ask the database for the money.
 */

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const session = vi.hoisted(() => ({ shopId: "shop_1", userId: "user_1", role: "TECH", name: "Tess", email: "tech@x" }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
  getSession: vi.fn(async () => session),
}));

const prefs = vi.hoisted(() => ({ simple: true, density: "comfortable", theme: "light", railCollapsed: false }));
vi.mock("@/lib/prefs", () => ({ readUiPrefs: vi.fn(async () => prefs) }));
vi.mock("@/lib/location", () => ({
  activeLocations: vi.fn(async () => []),
  locationWhere: vi.fn(async () => ({})),
  newRecordLocationId: vi.fn(async () => null),
}));
vi.mock("@/lib/warranty", () => ({ customerWarranties: vi.fn(async () => []) }));
vi.mock("@/lib/saved-views-query", () => ({ listSavedViews: async () => [] }));
vi.mock("@/lib/needs-reply", () => ({ needsReplyTicketIds: async () => [] }));
vi.mock("@/lib/payments", () => ({
  paymentsLive: () => false,
  cardOnFile: () => null,
  cardExpired: () => false,
  readTerminalLocationId: () => null,
  stripeTestMode: () => true,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ai/draft-reply", () => ({ DraftReplyControls: () => null }));
vi.mock("@/components/ai/summarize-dialog", () => ({ SummarizeTicketButton: () => null }));

const { requireMoneyUser } = await import("@/lib/money-guard");
const { canSeeMoney } = await import("@/lib/money-access");
const { default: InvoicesPage } = await import("@/app/(app)/invoices/page");
const { default: PosPage } = await import("@/app/(app)/pos/page");
const { default: PrintInvoicePage } = await import("@/app/print/invoices/[id]/page");
const { default: CustomersPage } = await import("@/app/(app)/customers/page");
const { default: CustomerPage } = await import("@/app/(app)/customers/[id]/page");
const { default: TicketPage } = await import("@/app/(app)/tickets/[id]/page");

type AnyPage = (props: never) => Promise<unknown>;
const call = (page: AnyPage, props: Record<string, unknown>) => (page as (p: Record<string, unknown>) => Promise<unknown>)(props);
const render = async (page: AnyPage, props: Record<string, unknown>) =>
  renderToStaticMarkup((await call(page, props)) as React.ReactElement);
const params = (value: Record<string, string>) => Promise.resolve(value);

/** Any dollar figure in rendered markup. */
const MONEY = /\$\s?\d/;

beforeEach(() => {
  resetDb();
  session.role = "TECH";
  prefs.simple = true;
});

describe("the policy", () => {
  it("lets owners and front desk see money, and nobody else", () => {
    expect(canSeeMoney("OWNER")).toBe(true);
    expect(canSeeMoney("FRONT_DESK")).toBe(true);
    expect(canSeeMoney("TECH")).toBe(false);
    expect(canSeeMoney(undefined)).toBe(false);
  });

  it("404s a technician on a money route and lets the front desk through", async () => {
    await expect(requireMoneyUser()).rejects.toThrow("NEXT_NOT_FOUND");
    session.role = "FRONT_DESK";
    await expect(requireMoneyUser()).resolves.toMatchObject({ role: "FRONT_DESK" });
  });
});

describe("a technician cannot load the money pages", () => {
  it.each([
    ["/invoices", InvoicesPage, { searchParams: params({}) }],
    ["/pos", PosPage, { searchParams: params({}) }],
    ["/print/invoices/[id]", PrintInvoicePage, { params: params({ id: "inv_1" }), searchParams: params({}) }],
  ] as const)("%s is a 404, before any query runs", async (_route, page, props) => {
    await expect(call(page as AnyPage, props)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toHaveLength(0);
  });
});

describe("customer data for a technician carries no money", () => {
  const customer = {
    id: "cus_1",
    firstName: "Anna",
    lastName: "Lopez",
    businessName: null,
    email: "anna@example.com",
    phone: null,
    mobile: "780-555-0142",
    address1: null,
    address2: null,
    city: null,
    state: null,
    postalCode: null,
    country: "US",
    notes: null,
    smsOptIn: false,
    emailOptIn: true,
    creditBalanceCents: 4_200,
    referredBy: null,
    createdAt: new Date("2026-01-02T12:00:00Z"),
    taxExempt: false,
    taxRate: null,
    stripeCustomerId: null,
    stripePaymentMethodId: null,
    cardBrand: null,
    cardLast4: null,
    cardExpMonth: null,
    cardExpYear: null,
    contacts: [],
    assets: [],
    updatedAt: new Date(),
    _count: { tickets: 1, invoices: 3, estimates: 1 },
  };

  beforeEach(() => {
    handlers["customer.findMany"] = () => [customer];
    handlers["customer.count"] = () => 1;
    handlers["customer.findFirst"] = () => customer;
    handlers["ticket.groupBy"] = () => [];
    handlers["ticket.findMany"] = () => [];
    handlers["ticket.count"] = () => 0;
    handlers["ticket.aggregate"] = () => ({ _max: { createdAt: null } });
    handlers["communicationLog.findMany"] = () => [];
    handlers["communicationLog.count"] = () => 0;
    handlers["shop.findUnique"] = () => ({ timezone: "UTC" });
    // Would-be leaks: answered with money so a render that used them would show it.
    handlers["invoice.findMany"] = () => [{ customerId: "cus_1", taxRateBps: 0, lines: [{ quantity: 1, unitPriceCents: 9_900, taxable: false }], payments: [], refunds: [] }];
    handlers["payment.findMany"] = () => [];
    handlers["payment.aggregate"] = () => ({ _sum: { amountCents: 12_300 }, _count: { _all: 1 } });
  });

  it("the customer list never queries balances and has no Balance column", async () => {
    prefs.simple = false;
    const html = await render(CustomersPage as AnyPage, { searchParams: params({}) });
    expect(callsTo("invoice.findMany")).toHaveLength(0);
    expect(html).not.toContain("Balance");
    expect(html).not.toMatch(MONEY);
  });

  it.each([true, false])("the customer page (easy %s) loads no invoices, payments or credit", async (simple) => {
    prefs.simple = simple;
    const html = await render(CustomerPage as AnyPage, { params: params({ id: "cus_1" }), searchParams: params({ tab: "invoices" }) });
    expect(callsTo("invoice.findMany")).toHaveLength(0);
    expect(callsTo("estimate.findMany")).toHaveLength(0);
    expect(callsTo("payment.findMany")).toHaveLength(0);
    expect(callsTo("payment.aggregate")).toHaveLength(0);
    expect(callsTo("creditAdjustment.findMany")).toHaveLength(0);
    expect(html).not.toMatch(MONEY);
    expect(html).not.toContain("Store credit");
    expect(html).not.toContain("New invoice");
    // The raw record id is never the thing on screen.
    expect(html).not.toContain(">cus_1<");
  });
});

describe("repair data for a technician carries no money", () => {
  const ticket = {
    id: "t_1",
    number: 1008,
    subject: "Cracked screen",
    problemType: "Screen",
    status: "Ready for Pickup",
    priority: "NORMAL",
    dueDate: null,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    updatedAt: new Date("2026-10-02T12:00:00Z"),
    resolvedAt: null,
    pickedUpAt: null,
    diagnosticNotes: null,
    customFields: null,
    assignedToId: null,
    assetId: null,
    checklist: null,
    checklistTemplateId: null,
    isWarranty: false,
    warrantyInvoiceLineId: null,
    locationId: null,
    location: null,
    customer: { id: "cus_1", firstName: "Anna", lastName: "Lopez", businessName: null, email: null, phone: null, mobile: "780-555-0142", smsOptIn: false, emailOptIn: false },
    asset: null,
    assignedTo: null,
    invoices: [],
    estimates: [],
    comments: [],
    charges: [],
    partOrders: [],
    timeEntries: [
      { id: "te_1", userId: "user_1", startedAt: new Date("2026-10-01T13:00:00Z"), endedAt: new Date("2026-10-01T14:00:00Z"), seconds: 3_600, note: null, billable: true, invoiceId: null, user: { name: "Tess" } },
    ],
    deposits: [],
    attachments: [],
  };

  beforeEach(() => {
    handlers["ticket.findFirst"] = () => ticket;
    handlers["shop.findUnique"] = () => ({ settings: null, taxRateBps: 825, timezone: "UTC" });
    handlers["user.findMany"] = () => [{ id: "user_1", name: "Tess" }];
    handlers["product.findMany"] = () => [{ id: "p_1", name: "iPhone 14 screen", taxable: true, vendorId: null }];
    handlers["cannedResponse.findMany"] = () => [];
    handlers["asset.findMany"] = () => [];
    handlers["checklistTemplate.findMany"] = () => [];
    handlers["vendor.findMany"] = () => [];
  });

  it.each([true, false])("the repair page (easy %s) never loads charges, invoices, deposits or prices", async (simple) => {
    prefs.simple = simple;
    const html = await render(TicketPage as AnyPage, { params: params({ id: "t_1" }), searchParams: params({ tab: "money" }) });

    const select = (callsTo("ticket.findFirst").at(-1)?.args.select ?? {}) as Record<string, { take?: number }>;
    expect(select.charges.take).toBe(0);
    expect(select.invoices.take).toBe(0);
    expect(select.estimates.take).toBe(0);
    expect(select.deposits.take).toBe(0);
    const product = callsTo("product.findMany")[0].args.select as Record<string, boolean>;
    expect(product.priceCents).toBe(false);
    expect(product.costCents).toBe(false);

    expect(html).not.toMatch(MONEY);
    expect(html).not.toContain("Take payment");
    expect(html).not.toContain("Make invoice");
    expect(html).not.toContain(">Money<");
  });

  it("a front desk sees the money button on the same repair", async () => {
    session.role = "FRONT_DESK";
    const html = await render(TicketPage as AnyPage, { params: params({ id: "t_1" }), searchParams: params({}) });
    const select = (callsTo("ticket.findFirst").at(-1)?.args.select ?? {}) as Record<string, { take?: number }>;
    expect(select.charges.take).toBeUndefined();
    // Nothing billed, an hour logged: bill it first, hand over only "anyway".
    expect(html).toContain("Make invoice");
    expect(html).toContain("Hand over anyway");
  });
});
