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

  it("needs a name or a phone number, and refuses a malformed email instead of saving it", () => {
    expect(readQuickCustomer(form({ customerId: "new" }))).toEqual({
      ok: false,
      error: "Add the new customer's name or phone number.",
    });
    expect(
      readQuickCustomer(form({ customerId: "new", newCustomerName: "  ", newCustomerPhone: "  " })),
    ).toMatchObject({ ok: false });
    expect(
      readQuickCustomer(form({ customerId: "new", newCustomerName: "Sam", newCustomerEmail: "sam@" })),
    ).toMatchObject({ ok: false });
  });

  it('saves a phone-only customer as "Customer" + the number', () => {
    expect(
      readQuickCustomer(form({ customerId: "new", newCustomerPhone: "  780 555 0142 ", newCustomerSmsOk: "on" })),
    ).toEqual({
      ok: true,
      customer: { firstName: "Customer", lastName: "780 555 0142", phone: "780 555 0142", email: null, smsOk: true },
    });
  });

  it("splits a typed name on the first space and drops the extra spaces", () => {
    expect(readQuickCustomer(form({ customerId: "new", newCustomerName: " Anna  Maria Lopez " }))).toMatchObject({
      ok: true,
      customer: { firstName: "Anna", lastName: "Maria Lopez", phone: null },
    });
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

  it("creates a phone-only customer under the number's placeholder name", async () => {
    handlers["$queryRaw"] = () => [];
    handlers["customer.findFirst"] = () => null;
    handlers["customer.create"] = () => ({ id: "c11" });
    expect(
      await findOrCreateQuickCustomer("s1", { firstName: "Customer", lastName: "780-555-0142", phone: "780-555-0142", email: null, smsOk: false }),
    ).toBe("c11");
    expect(dataOf("customer.create")).toMatchObject({ firstName: "Customer", lastName: "780-555-0142", mobile: "780-555-0142", smsOptIn: false });
  });

  it("creates a new customer, reachable by email and (with consent) text", async () => {
    handlers["$queryRaw"] = () => [];
    handlers["customer.findFirst"] = () => null;
    handlers["customer.create"] = () => ({ id: "c10" });
    expect(await findOrCreateQuickCustomer("s1", person)).toBe("c10");
    expect(dataOf("customer.create")).toMatchObject({ shopId: "s1", emailOptIn: true, smsOptIn: true, mobile: "780-555-0142" });
  });
});
