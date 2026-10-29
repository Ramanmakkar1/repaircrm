import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ userId: "user_1", shopId: "shop_1", role: "OWNER", name: "Zoe" })),
}));

const { saveCustomFieldsAction } = await import("@/app/(app)/tickets/actions");
const { quotedPriceCents, shopCustomFields } = await import("@/lib/ticket-quote");
const { ticketSheetProps } = await import("@/components/billing/print-mappers");

/**
 * The price quoted at check-in lives in Ticket.customFields. It used to be
 * written and never read: the repair showed "quotedPriceCents 18999" as a raw
 * custom field (to technicians too), the work order left it off, and saving
 * the Custom fields card erased it.
 */

const STORED = { quotedPriceCents: 18_999, termsAcceptedAt: null, "Loaner issued": "yes" };

beforeEach(() => {
  resetDb();
  handlers["ticket.findFirst"] = (args) => {
    const where = args.where as { id?: string; shopId?: string };
    return where.shopId === "shop_1" && where.id === "tkt_1"
      ? { id: "tkt_1", shopId: "shop_1", number: 1000, customerId: "c1", status: "New", customFields: STORED }
      : null;
  };
  handlers["ticket.update"] = (args) => args.data;
});

describe("check-in quote", () => {
  it("reads the quote in cents and keeps it out of the shop's own fields", () => {
    expect(quotedPriceCents(STORED)).toBe(18_999);
    expect(quotedPriceCents({ quotedPriceCents: null })).toBeNull();
    expect(quotedPriceCents(null)).toBeNull();
    expect(quotedPriceCents({ quotedPriceCents: "18999" })).toBeNull();
    expect(shopCustomFields(STORED)).toEqual({ "Loaner issued": "yes" });
  });

  it("saving the Custom fields card keeps the check-in quote", async () => {
    const form = new FormData();
    form.append("fieldKey", "Loaner issued");
    form.append("fieldValue", "no");

    const result = await saveCustomFieldsAction("tkt_1", {}, form);

    expect(result).toEqual({ ok: true });
    expect(callsTo("ticket.findFirst").every((call) => (call.args.where as { shopId?: string }).shopId === "shop_1")).toBe(true);
    expect(dataOf("ticket.update").customFields).toEqual({ "Loaner issued": "no", quotedPriceCents: 18_999 });
  });

  it("prints the quote on the work order only when it is passed", () => {
    const ticket = {
      number: 1000,
      createdAt: new Date("2026-10-29T15:00:00Z"),
      status: "New",
      priority: "NORMAL",
      assignedTo: null,
      dueDate: null,
      subject: "Screen",
      problemType: "Screen Repair",
      asset: null,
      customer: { firstName: "Ngozi", lastName: "Smith", companyName: null },
      charges: [],
      diagnosticNotes: null,
    } as unknown as Parameters<typeof ticketSheetProps>[0];
    const shop = { name: "Shop", timezone: "UTC" } as unknown as Parameters<typeof ticketSheetProps>[1];

    const withQuote = ticketSheetProps(ticket, shop, { quotedCents: 18_999 }).meta;
    expect(withQuote).toContainEqual({ label: "Quoted", value: "$189.99" });
    expect(ticketSheetProps(ticket, shop).meta.some((row) => row.label === "Quoted")).toBe(false);
  });
});
