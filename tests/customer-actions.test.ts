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
const session = { shopId: "shop_1", userId: "user_1", role: "FRONT_DESK", name: "Dana" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));
vi.mock("@/lib/events", () => ({ emitCustomerEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

const { createCustomerAction, updateCustomerAction } = await import("@/app/(app)/customers/actions");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** Runs a create/update action to its redirect and returns where it went. */
async function redirectedTo(run: Promise<unknown>): Promise<string> {
  const error = await run.then(
    () => null,
    (thrown: Error) => thrown,
  );
  expect(error?.message).toMatch(/^REDIRECT:/);
  return error!.message.replace("REDIRECT:", "");
}

beforeEach(() => {
  resetDb();
  handlers["customer.create"] = () => ({ id: "cus_new" });
});

describe("createCustomerAction — the name box", () => {
  it("splits the full name on the first space and saves it for the session's shop", async () => {
    const to = await redirectedTo(
      createCustomerAction(undefined, form({ name: "  Anna   Maria Lopez ", mobile: "780-555-0142" })),
    );

    expect(to).toBe("/customers/cus_new?flash=created");
    expect(dataOf("customer.create")).toMatchObject({
      shopId: "shop_1",
      firstName: "Anna",
      lastName: "Maria Lopez",
      mobile: "780-555-0142",
    });
  });

  it("saves a one-word name with an empty last name", async () => {
    await redirectedTo(createCustomerAction(undefined, form({ name: "Cher" })));

    expect(dataOf("customer.create")).toMatchObject({ firstName: "Cher", lastName: "" });
  });

  it("still reads firstName/lastName from older callers", async () => {
    await redirectedTo(createCustomerAction(undefined, form({ firstName: "Sam", lastName: "Lee" })));

    expect(dataOf("customer.create")).toMatchObject({ firstName: "Sam", lastName: "Lee" });
  });
});

describe("createCustomerAction — phone only", () => {
  it('is saved as "Customer" + the mobile number', async () => {
    await redirectedTo(createCustomerAction(undefined, form({ mobile: "780-555-0142" })));

    expect(dataOf("customer.create")).toMatchObject({
      firstName: "Customer",
      lastName: "780-555-0142",
      mobile: "780-555-0142",
    });
  });

  it("falls back to the office phone when there is no mobile", async () => {
    await redirectedTo(createCustomerAction(undefined, form({ phone: "780-555-0100" })));

    expect(dataOf("customer.create")).toMatchObject({ firstName: "Customer", lastName: "780-555-0100" });
  });

  it("names the customer after the mobile when both numbers are given", async () => {
    await redirectedTo(
      createCustomerAction(undefined, form({ mobile: "780-555-0142", phone: "780-555-0100" })),
    );

    expect(dataOf("customer.create")).toMatchObject({ lastName: "780-555-0142" });
  });
});

describe("createCustomerAction — neither a name nor a phone number", () => {
  it('says "Add a name or a phone number" on the name box and saves nothing', async () => {
    const result = await createCustomerAction(undefined, form({ name: "   ", email: "sam@example.com" }));

    expect(result).toEqual({
      error: "Please fix the highlighted fields.",
      fieldErrors: { name: "Add a name or a phone number" },
    });
    expect(callsTo("customer.create")).toEqual([]);
  });
});

describe("updateCustomerAction", () => {
  function stubOwned(firstName: string, lastName: string) {
    handlers["customer.findFirst"] = () => ({ id: "cus_1", firstName, lastName });
    handlers["customer.update"] = () => ({ id: "cus_1" });
  }

  it("looks the customer up in the session's shop", async () => {
    stubOwned("Anna", "Lopez");
    await redirectedTo(updateCustomerAction(undefined, form({ id: "cus_1", name: "Anna Lopez" })));

    expect(whereOf("customer.findFirst")).toEqual({ id: "cus_1", shopId: "shop_1" });
  });

  it("keeps a stored split that the single name box cannot show", async () => {
    // First "Anna Maria", last "Lopez": the box shows "Anna Maria Lopez".
    // Re-splitting it would save "Anna" + "Maria Lopez" and change the sort order.
    stubOwned("Anna Maria", "Lopez");

    const to = await redirectedTo(
      updateCustomerAction(undefined, form({ id: "cus_1", name: "Anna Maria Lopez", mobile: "780-555-0142" })),
    );

    expect(to).toBe("/customers/cus_1?flash=updated");
    expect(dataOf("customer.update")).toMatchObject({ firstName: "Anna Maria", lastName: "Lopez" });
  });

  it("ignores extra spaces when deciding the name was not edited", async () => {
    stubOwned("Anna Maria", "Lopez");

    await redirectedTo(updateCustomerAction(undefined, form({ id: "cus_1", name: " Anna  Maria Lopez " })));

    expect(dataOf("customer.update")).toMatchObject({ firstName: "Anna Maria", lastName: "Lopez" });
  });

  it("splits the name on the first space once it was really edited", async () => {
    stubOwned("Anna Maria", "Lopez");

    await redirectedTo(updateCustomerAction(undefined, form({ id: "cus_1", name: "Anna Maria Garcia" })));

    expect(dataOf("customer.update")).toMatchObject({ firstName: "Anna", lastName: "Maria Garcia" });
  });

  it("renames a phone-only customer after the new number when the name box is empty", async () => {
    // The form shows the placeholder name as an empty box.
    stubOwned("Customer", "780-555-0142");

    await redirectedTo(updateCustomerAction(undefined, form({ id: "cus_1", mobile: "780-555-0199" })));

    expect(dataOf("customer.update")).toMatchObject({
      firstName: "Customer",
      lastName: "780-555-0199",
      mobile: "780-555-0199",
    });
  });

  it("does not reset the country, which the form has no box for", async () => {
    stubOwned("Anna", "Lopez");

    await redirectedTo(updateCustomerAction(undefined, form({ id: "cus_1", name: "Anna Lopez" })));

    // `undefined` is "leave unchanged" to Prisma; the old "US" overwrote a country an API client had set.
    expect(dataOf("customer.update").country).toBeUndefined();
  });

  it("writes nothing for a customer from another shop", async () => {
    handlers["customer.findFirst"] = () => null;

    const result = await updateCustomerAction(undefined, form({ id: "cus_other", name: "Anna Lopez" }));

    expect(result).toEqual({ error: "Customer not found." });
    expect(callsTo("customer.update")).toEqual([]);
  });
});
