import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// redirect() throws by design; a sentinel lets the test read where it went.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ shopId: "shop_1", userId: "user_1", role: "FRONT_DESK", name: "Dana" })),
}));
vi.mock("@/lib/events", () => ({ emitTicketEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/comms", () => ({ sendEmail: vi.fn(async () => {}), sendSms: vi.fn(async () => {}) }));
vi.mock("@/lib/location", () => ({
  validLocationId: vi.fn(async () => null),
  newRecordLocationId: vi.fn(async () => null),
}));

const { createTicketAction } = await import("@/app/(app)/tickets/actions");

/**
 * REPAIR INTAKE — createTicketAction with a customer and a device that do not
 * exist yet. What matters here is decidable from what the action hands Prisma:
 * who gets created (and with which name and consent), under which shop, and
 * whether a person already on file is found whatever way their number was typed.
 */

const REPAIR = {
  subject: "iPhone 14 — Screen Repair",
  problemType: "Screen Repair",
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...REPAIR, ...fields })) fd.set(key, value);
  return fd;
}

async function submit(fields: Record<string, string>): Promise<{ error?: string; redirect?: string }> {
  try {
    const result = await createTicketAction(undefined as never, form(fields));
    return { error: result?.error };
  } catch (thrown) {
    const message = (thrown as Error).message;
    if (message.startsWith("REDIRECT:")) return { redirect: message.replace("REDIRECT:", "") };
    throw thrown;
  }
}

/** A clean database where nobody is on file yet. */
function freshShop(): void {
  resetDb();
  // The digit match finds no ids and the duplicate lookup nothing.
  handlers["$queryRaw"] = () => [];
  handlers["customer.findFirst"] = () => null;
  handlers["customer.create"] = () => ({ id: "cus_new" });
  handlers["asset.create"] = () => ({ id: "asset_new" });
  handlers["ticket.aggregate"] = () => ({ _max: { number: null } });
  handlers["ticket.create"] = () => ({ id: "tkt_1" });
  handlers["shop.findUnique"] = () => ({ settings: null });
  handlers["checklistTemplate.findFirst"] = () => null;
}

beforeEach(freshShop);

describe("createTicketAction — new customer and new device", () => {
  it("creates both, then the repair that points at them, all for the session's shop", async () => {
    const result = await submit({
      customerId: "__new__",
      newCustomerName: "Anna Maria Lopez",
      newCustomerPhone: "780-555-0142",
      newCustomerEmail: "Anna@Example.com",
      newCustomerSmsOk: "on",
      assetId: "__new__",
      newDeviceType: "Phone",
      newDeviceMake: "Apple",
      newDeviceModel: "iPhone 14",
    });

    expect(result).toEqual({ redirect: "/tickets/tkt_1" });
    expect(dataOf("customer.create")).toEqual({
      shopId: "shop_1",
      firstName: "Anna",
      lastName: "Maria Lopez",
      email: "anna@example.com",
      phone: "780-555-0142",
      mobile: "780-555-0142",
      smsOptIn: true,
      emailOptIn: true,
    });
    expect(dataOf("asset.create")).toEqual({
      shopId: "shop_1",
      customerId: "cus_new",
      type: "Phone",
      make: "Apple",
      model: "iPhone 14",
      serial: "",
      password: null,
    });
    expect(dataOf("ticket.create")).toMatchObject({
      shopId: "shop_1",
      number: 1000,
      customerId: "cus_new",
      assetId: "asset_new",
      subject: "iPhone 14 — Screen Repair",
    });
  });

  it('saves a customer with only a phone number as "Customer <number>"', async () => {
    await submit({ customerId: "__new__", newCustomerPhone: "780-555-0142" });

    expect(dataOf("customer.create")).toMatchObject({
      firstName: "Customer",
      lastName: "780-555-0142",
      mobile: "780-555-0142",
      email: null,
    });
  });

  it("only records text consent when the customer said yes and left a number", async () => {
    await submit({ customerId: "__new__", newCustomerName: "Sam Lee", newCustomerPhone: "780-555-0142" });
    expect(dataOf("customer.create")).toMatchObject({ smsOptIn: false });

    freshShop();
    await submit({ customerId: "__new__", newCustomerName: "Sam Lee", newCustomerSmsOk: "on" });
    expect(dataOf("customer.create")).toMatchObject({ smsOptIn: false, phone: null });
  });

  it("refuses a new customer with neither a name nor a phone number, before touching anything", async () => {
    const result = await submit({ customerId: "__new__", newCustomerEmail: "sam@example.com" });

    expect(result.error).toBe("Enter a name or a phone number.");
    expect(callsTo("customer.create")).toEqual([]);
    expect(callsTo("ticket.create")).toEqual([]);
  });

  it("refuses a new device with no type", async () => {
    const result = await submit({ customerId: "__new__", newCustomerName: "Sam Lee", assetId: "__new__", newDeviceType: "" });

    expect(result.error).toBe("Check the new device details.");
    expect(callsTo("customer.create")).toEqual([]);
    expect(callsTo("asset.create")).toEqual([]);
  });
});

describe("createTicketAction — a new customer who is already on file", () => {
  const MATCH = "This contact matches Anna Lopez. Select that existing customer to avoid a duplicate.";

  it("finds them by digits, so a differently typed number is still the same person", async () => {
    // "(780) 555-0142" on file, "780-555-0142" typed now: the database compares
    // digits to digits and hands back the id.
    handlers["$queryRaw"] = () => [{ id: "cus_9" }];
    handlers["customer.findFirst"] = () => ({ firstName: "Anna", lastName: "Lopez" });

    const result = await submit({ customerId: "__new__", newCustomerName: "Anna L", newCustomerPhone: "780-555-0142" });

    expect(result.error).toBe(MATCH);
    // The last seven digits, in this shop only — as estimates, invoices and appointments do.
    expect(callsTo("$queryRaw")[0].args.values).toEqual(["shop_1", "%5550142%", "%5550142%", 50]);
    expect(whereOf("customer.findFirst")).toEqual({ shopId: "shop_1", OR: [{ id: { in: ["cus_9"] } }] });
    expect(callsTo("customer.create")).toEqual([]);
    expect(callsTo("ticket.create")).toEqual([]);
  });

  it("matches on the last seven digits even when a country code was typed", async () => {
    handlers["$queryRaw"] = () => [{ id: "cus_9" }];
    handlers["customer.findFirst"] = () => ({ firstName: "Anna", lastName: "Lopez" });

    const result = await submit({ customerId: "__new__", newCustomerPhone: "+1 (780) 555-0142" });

    expect(result.error).toBe(MATCH);
    expect(callsTo("$queryRaw")[0].args.values).toEqual(["shop_1", "%5550142%", "%5550142%", 50]);
  });

  it("still matches by email, whatever its case", async () => {
    handlers["customer.findFirst"] = () => ({ firstName: "Anna", lastName: "Lopez" });

    const result = await submit({ customerId: "__new__", newCustomerName: "Anna", newCustomerEmail: "ANNA@Example.com" });

    expect(result.error).toBe(MATCH);
    expect(whereOf("customer.findFirst")).toEqual({
      shopId: "shop_1",
      OR: [{ email: { equals: "anna@example.com", mode: "insensitive" } }],
    });
  });

  it("does not match on fewer digits than the other forms do", async () => {
    // Too few digits to identify anybody: no lookup, so the customer is added.
    const result = await submit({ customerId: "__new__", newCustomerName: "Sam Lee", newCustomerPhone: "555-01" });

    expect(result).toEqual({ redirect: "/tickets/tkt_1" });
    expect(callsTo("$queryRaw")).toEqual([]);
    expect(callsTo("customer.findFirst")).toEqual([]);
    expect(callsTo("customer.create")).toHaveLength(1);
  });

  it("adds the customer when nobody on file matches", async () => {
    const result = await submit({ customerId: "__new__", newCustomerName: "Sam Lee", newCustomerPhone: "780-555-0199" });

    expect(result).toEqual({ redirect: "/tickets/tkt_1" });
    expect(callsTo("$queryRaw")[0].args.values).toEqual(["shop_1", "%5550199%", "%5550199%", 50]);
    expect(callsTo("customer.create")).toHaveLength(1);
  });
});
