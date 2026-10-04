import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
const sendEmail = vi.fn<(args: Record<string, unknown>) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
const sendSms = vi.fn<(args: Record<string, unknown>) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock("@/lib/comms", () => ({
  sendEmail: (args: Record<string, unknown>) => sendEmail(args),
  sendSms: (args: Record<string, unknown>) => sendSms(args),
  portalUrl: (path: string) => `https://shop.test${path}`,
}));
vi.mock("@/lib/sequence", () => ({
  withNextNumber: (_shopId: string, _kind: string, create: (n: number) => Promise<unknown>) => create(1042),
}));

const { submitCheckinAction } = await import("@/app/checkin/[slug]/actions");
const { EMPTY_CHECKIN, checkinFields } = await import("@/app/checkin/[slug]/flow");

const SHOP = { id: "shop_1", name: "Demo Repair Shop", settings: { checkin: { enabled: true } } };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  resetDb();
  sendEmail.mockClear();
  sendSms.mockClear();
  handlers["shop.findUnique"] = () => SHOP;
  handlers["ticket.count"] = () => 0;
  handlers["location.findFirst"] = () => null;
  handlers["customer.findFirst"] = () => null;
  handlers["customer.create"] = () => ({ id: "cus_new" });
  handlers["asset.create"] = () => ({ id: "asset_new" });
  handlers["ticket.create"] = () => ({ id: "tkt_1", number: 1042, customerId: "cus_new" });
});

describe("the new check-in screen against the unchanged action", () => {
  const state = {
    ...EMPTY_CHECKIN,
    kindType: "Phone",
    problem: "Screen Repair",
    name: "Ada Lovelace",
    phone: "(512) 555-0142",
    accepted: true,
    signature: "data:image/png;base64,AAAA",
  };

  it("checks a device in with an empty note (the screen fills the description) and keeps every query on the slug's shop", async () => {
    const fields = checkinFields(state, { make: true, model: true, serial: true, unlockCode: false });
    const result = await submitCheckinAction("demo", form({ ...fields, website: "" }));

    expect(result).toEqual({ ok: true, ticketNumber: 1042 });
    expect(whereOf("shop.findUnique")).toEqual({ slug: "demo" });
    expect(whereOf("ticket.count")).toMatchObject({ shopId: "shop_1", source: "checkin" });
    const ticket = dataOf("ticket.create");
    expect(ticket).toMatchObject({ shopId: "shop_1", problemType: "Screen Repair", status: "New", source: "checkin" });
    const comment = (ticket.comments as { create: { body: string } }).create;
    expect(comment.body).toBe("Picked “Screen Repair” on the check-in screen. No extra note.");
    expect(dataOf("asset.create")).toMatchObject({ shopId: "shop_1", type: "Phone", password: null });
  });

  it("tells the customer their REPAIR number, not a ticket number (item 10)", async () => {
    await submitCheckinAction("demo", form({ ...checkinFields(state, { make: true, model: true, serial: true, unlockCode: true }), website: "" }));
    const email = sendEmail.mock.calls[0]?.[0] as { subject: string; body: string; context: string };
    const sms = sendSms.mock.calls[0]?.[0] as { body: string };
    expect(email.subject).toBe("Checked in: repair #1042");
    expect(email.body).toContain("as repair #1042");
    expect(email.context).toBe("Repair #1042 · Demo Repair Shop");
    expect(sms.body).toBe("Checked in at Demo Repair Shop, repair #1042.");
    // The link's own path (/portal/tickets/...) is a URL, not a word anyone reads.
    for (const text of [email.subject, email.body, email.context, sms.body]) {
      expect(text.replace(/https?:\/\/\S+/g, "")).not.toMatch(/ticket/i);
    }
  });

  it("still refuses an unsigned or unticked check-in (validation unchanged)", async () => {
    const unsigned = await submitCheckinAction("demo", form({ ...checkinFields({ ...state, signature: "" }, { make: true, model: true, serial: true, unlockCode: true }) }));
    expect(unsigned).toEqual({ ok: false, error: "Please sign in the box." });
    const unticked = await submitCheckinAction("demo", form({ ...checkinFields({ ...state, accepted: false }, { make: true, model: true, serial: true, unlockCode: true }) }));
    expect(unticked).toEqual({ ok: false, error: "Please accept the terms before checking in." });
    expect(callsTo("ticket.create")).toHaveLength(0);
  });

  it("a filled honeypot looks successful and writes nothing", async () => {
    const result = await submitCheckinAction("demo", form({ website: "spam" }));
    expect(result).toEqual({ ok: true, ticketNumber: 0 });
    expect(callsTo("shop.findUnique")).toHaveLength(0);
  });
});
