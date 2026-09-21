import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("@/lib/events", () => ({ emitCustomerEvent: vi.fn(async () => {}) }));

const { findOrCreateQuickCustomer, readQuickCustomer } = await import("@/lib/customers/quick-add");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => resetDb());

describe("readQuickCustomer", () => {
  it("is not involved when an existing customer was picked", () => {
    expect(readQuickCustomer(form({ customerId: "c1" }))).toBeNull();
  });

  it("needs a name, and refuses a malformed email instead of saving it", () => {
    expect(readQuickCustomer(form({ customerId: "new" }))).toMatchObject({ ok: false });
    expect(
      readQuickCustomer(form({ customerId: "new", newCustomerName: "Sam", newCustomerEmail: "sam@" })),
    ).toMatchObject({ ok: false });
  });

  it("only records text consent when there is a number to text", () => {
    const withPhone = readQuickCustomer(
      form({ customerId: "new", newCustomerName: "Sam Lee", newCustomerPhone: "780 555 0142", newCustomerSmsOk: "on" }),
    );
    expect(withPhone).toMatchObject({ ok: true, customer: { firstName: "Sam", lastName: "Lee", smsOk: true } });
    const noPhone = readQuickCustomer(form({ customerId: "new", newCustomerName: "Sam", newCustomerSmsOk: "on" }));
    expect(noPhone).toMatchObject({ ok: true, customer: { smsOk: false } });
  });
});

describe("findOrCreateQuickCustomer", () => {
  const person = { firstName: "Sam", lastName: "Lee", phone: "780-555-0142", email: null, smsOk: true };

  it("uses the customer already on file with that mobile", async () => {
    handlers["$queryRaw"] = () => [{ id: "c9" }];
    handlers["customer.findFirst"] = () => ({ id: "c9" });
    expect(await findOrCreateQuickCustomer("s1", person)).toBe("c9");
    expect(callsTo("customer.create")).toHaveLength(0);
    // Digits against digits, inside the shop: "780-555-0142" on file as
    // "(780) 555-0142" is the same person.
    expect(callsTo("$queryRaw")[0].args.values).toEqual(["s1", "%5550142%", "%5550142%", 50]);
    expect(callsTo("customer.findFirst")[0].args.where).toEqual({ shopId: "s1", OR: [{ id: { in: ["c9"] } }] });
  });

  it("creates a new customer, reachable by email and (with consent) text", async () => {
    handlers["$queryRaw"] = () => [];
    handlers["customer.findFirst"] = () => null;
    handlers["customer.create"] = () => ({ id: "c10" });
    expect(await findOrCreateQuickCustomer("s1", person)).toBe("c10");
    expect(dataOf("customer.create")).toMatchObject({ shopId: "s1", emailOptIn: true, smsOptIn: true, mobile: "780-555-0142" });
  });
});
