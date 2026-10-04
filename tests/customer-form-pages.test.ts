import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * /customers/new and /customers/[id]/edit, called as the async functions they
 * are and rendered to markup.
 *
 *  - Easy mode (the default) draws the quick add, wide enough for "This customer"
 *    beside the boxes.
 *  - Full mode keeps today's compact form and its page text.
 *  - Every query is still scoped to the session's shop, and another shop's id is a 404.
 */

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Ada" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const prefs = { simple: true, density: "comfortable", theme: "light", railCollapsed: false };
vi.mock("@/lib/prefs", () => ({ readUiPrefs: vi.fn(async () => prefs) }));
vi.mock("@/app/(app)/customers/actions", () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: NewCustomerPage } = await import("@/app/(app)/customers/new/page");
const { default: EditCustomerPage } = await import("@/app/(app)/customers/[id]/edit/page");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const stored = {
  id: "cus_1",
  firstName: "Anna",
  lastName: "Lopez",
  businessName: null,
  email: null,
  phone: null,
  mobile: "780-555-0142",
  address1: null,
  address2: null,
  city: null,
  state: null,
  postalCode: null,
  referredBy: null,
  notes: null,
  smsOptIn: false,
  emailOptIn: true,
  taxExempt: false,
  taxRateId: null,
};

const renderNew = async () => renderToStaticMarkup(await (NewCustomerPage as () => Promise<ReactElement>)());
const renderEdit = async (id = "cus_1") =>
  renderToStaticMarkup(await (EditCustomerPage as (props: { params: Promise<{ id: string }> }) => Promise<ReactElement>)({ params: Promise.resolve({ id }) }));

beforeEach(() => {
  resetDb();
  prefs.simple = true;
  handlers["taxRate.findMany"] = () => [];
  handlers["customer.findFirst"] = () => stored;
});

describe("/customers/new", () => {
  it("draws the Easy quick add, wide, without the long description", async () => {
    const html = await renderNew();
    expect(html).toContain("max-w-6xl");
    expect(html).not.toContain("max-w-3xl");
    expect(text(html)).toContain("New customer");
    expect(text(html)).toContain("Mobile number");
    expect(text(html)).toContain("This customer");
    expect(text(html)).toContain("Save customer");
    expect(text(html)).not.toContain("Switch on anything else you need");
  });

  it("keeps the full form and its description in Full mode", async () => {
    prefs.simple = false;
    const html = await renderNew();
    expect(html).toContain("max-w-3xl");
    expect(text(html)).toContain("Just a name or a phone number. Switch on anything else you need.");
    expect(text(html)).toContain("Text repair updates");
    expect(text(html)).not.toContain("This customer");
  });

  it("loads the shop's tax rates for this shop only", async () => {
    await renderNew();
    expect(whereOf("taxRate.findMany")).toEqual({ shopId: "shop_1" });
  });
});

describe("/customers/[id]/edit", () => {
  it("draws the Easy quick add for the customer, found in this shop only", async () => {
    const html = await renderEdit();
    expect(html).toContain("max-w-6xl");
    expect(text(html)).toContain("Edit customer");
    expect(text(html)).toContain("Save changes");
    expect(html).toMatch(/<input[^>]*id="name"[^>]*value="Anna Lopez"/);
    expect(whereOf("customer.findFirst")).toEqual({ id: "cus_1", shopId: "shop_1" });
    expect(callsTo("customer.findFirst")).toHaveLength(1);
  });

  it("keeps the full form and its description in Full mode", async () => {
    prefs.simple = false;
    const html = await renderEdit();
    expect(html).toContain("max-w-3xl");
    expect(text(html)).toContain("Changes apply from the next repair, estimate and invoice on.");
    expect(text(html)).toContain("Phone number");
    expect(text(html)).not.toContain("This customer");
  });

  it("is a 404 for a customer that is not in this shop", async () => {
    handlers["customer.findFirst"] = () => null;
    await expect(renderEdit("cus_other")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
