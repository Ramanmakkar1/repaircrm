import { beforeEach, describe, expect, it, vi } from "vitest";

import { setCustomerFieldAction } from "@/app/(app)/customers/field-actions";
import { setTicketFieldAction } from "@/app/(app)/tickets/field-actions";

import { calls, callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

/**
 * `revalidatePath` is Next's, needs a request scope, and has nothing to say
 * about the two properties this file exists for. Stubbed so the actions can be
 * called as plain functions.
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

/**
 * The session is the ONLY source of `shopId`. Mocking `requireUser` is what
 * lets these tests prove that: the actions take `shopId` from here and never
 * from an argument, so there is no argument a test could pass to make them
 * write into another tenant.
 */
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    userId: "user_1",
    shopId: "shop_1",
    role: "FRONT_DESK",
    name: "Dana",
    email: "dana@example.com",
    pv: 0,
  })),
}));

/**
 * INLINE FIELD WRITES — app/(app)/tickets/field-actions.ts and
 * app/(app)/customers/field-actions.ts.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THESE TWO DANGEROUS
 * ---------------------------------------------------------------------------
 * Every other write in the app is shaped like the record it writes: an invoice
 * action knows it is writing an invoice. These two are shaped like an
 * ASSIGNMENT — "set this field to that value" — with the field named by the
 * browser. That is one careless `data: { [field]: value }` away from being a
 * general-purpose "set any column on any row" endpoint, which would let a
 * caller move a ticket between tenants (`shopId`), collide a primary key
 * (`id`), or write a money column (`depositCents`) with none of the arithmetic
 * that is supposed to produce it.
 *
 * So the two properties asserted below are the ones that matter:
 *
 *   1. every query carries the SESSION's shopId, and a foreign id writes
 *      nothing;
 *   2. a field name outside the allow-list is refused before any query runs.
 *
 * The second is asserted as `calls` being EMPTY rather than as an error
 * message: a refusal that still issued a read has already told the caller
 * whether the row exists, and one that still issued a write is not a refusal.
 *
 * The date test is here for a bug this codebase has already had: a bare
 * `yyyy-mm-dd` handed to `new Date()` is UTC midnight, which is the previous
 * day everywhere west of Greenwich, so a due date typed as the 8th is stored
 * — and read back — as the 7th.
 */

const SHOP = "shop_1";

beforeEach(() => {
  resetDb();
});

/** A write that succeeds for this shop and matches nothing for any other. */
function stubScopedUpdate(path: "ticket.updateMany" | "customer.updateMany"): void {
  handlers[path] = (args) => {
    const where = (args.where ?? {}) as { shopId?: string };
    return { count: where.shopId === SHOP ? 1 : 0 };
  };
}

describe("setTicketFieldAction — the allow-list", () => {
  const OFF_LIST = [
    // The tenant column. Writing it would hand the ticket to another shop.
    "shopId",
    // The primary key.
    "id",
    // Money, which is supposed to be the sum of the Deposit rows.
    "depositCents",
    // A real column, but not one a header cell may move.
    "status",
    // Relation syntax, in case a name is ever pasted into a nested write.
    "customer",
    // Not a column at all.
    "notAColumn",
  ];

  for (const field of OFF_LIST) {
    it(`refuses "${field}" without touching the database`, async () => {
      stubScopedUpdate("ticket.updateMany");

      const result = await setTicketFieldAction("tkt_1", field, "shop_2");

      expect(result.error).toBe("That field can't be edited from here.");
      expect(result.ok).toBeUndefined();
      // Not "no write" — no query at all. See the note above.
      expect(calls).toEqual([]);
    });
  }

  it("accepts exactly four names and no others", async () => {
    // Pins the list itself: adding a fifth field has to come here first.
    const accepted: string[] = [];
    for (const field of ["dueDate", "assignedToId", "priority", "problemType"]) {
      resetDb();
      stubScopedUpdate("ticket.updateMany");
      handlers["user.findFirst"] = () => ({ id: "user_2" });
      handlers["shop.findUnique"] = () => ({ settings: null });

      const value =
        field === "dueDate"
          ? "2026-09-08"
          : field === "assignedToId"
            ? "user_2"
            : field === "priority"
              ? "HIGH"
              : "Screen";

      const result = await setTicketFieldAction("tkt_1", field, value);
      if (result.ok) accepted.push(field);
    }

    expect(accepted).toEqual([
      "dueDate",
      "assignedToId",
      "priority",
      "problemType",
    ]);
  });
});

describe("setTicketFieldAction — tenancy", () => {
  it("scopes the write to the session's shop, never an argument", async () => {
    stubScopedUpdate("ticket.updateMany");

    const result = await setTicketFieldAction("tkt_1", "priority", "URGENT");

    expect(result.ok).toBe(true);
    expect(whereOf("ticket.updateMany")).toEqual({ id: "tkt_1", shopId: SHOP });
    expect(dataOf("ticket.updateMany")).toEqual({ priority: "URGENT" });
  });

  it("writes nothing for a ticket id belonging to another shop", async () => {
    // The scoped `updateMany` IS the ownership check — a foreign id matches
    // zero rows, and zero rows reads back as "not found" rather than as a
    // different error, so the endpoint cannot be used to probe for ids.
    handlers["ticket.updateMany"] = () => ({ count: 0 });

    const result = await setTicketFieldAction("tkt_from_shop_2", "priority", "LOW");

    expect(result).toEqual({ error: "Ticket not found." });
  });

  it("scopes the assignee check, so another shop's user cannot be attached", async () => {
    stubScopedUpdate("ticket.updateMany");
    handlers["user.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { shopId?: string };
      return where.shopId === SHOP ? { id: "user_2" } : null;
    };

    const ok = await setTicketFieldAction("tkt_1", "assignedToId", "user_2");

    expect(ok.ok).toBe(true);
    expect(whereOf("user.findFirst")).toEqual({ id: "user_2", shopId: SHOP });
  });

  it("refuses an assignee the scoped lookup cannot find", async () => {
    handlers["user.findFirst"] = () => null;

    const result = await setTicketFieldAction("tkt_1", "assignedToId", "user_elsewhere");

    expect(result).toEqual({ error: "That person is not on this shop's team." });
    // Refused before the write, so the ticket is untouched.
    expect(callsTo("ticket.updateMany")).toEqual([]);
  });

  it("reads the problem-type list from the session's own shop row", async () => {
    stubScopedUpdate("ticket.updateMany");
    handlers["shop.findUnique"] = () => ({
      settings: { problemTypes: ["Screen", "Battery"] },
    });

    const ok = await setTicketFieldAction("tkt_1", "problemType", "Battery");
    expect(ok.ok).toBe(true);
    expect(whereOf("shop.findUnique")).toEqual({ id: SHOP });

    resetDb();
    stubScopedUpdate("ticket.updateMany");
    handlers["shop.findUnique"] = () => ({
      settings: { problemTypes: ["Screen", "Battery"] },
    });

    const refused = await setTicketFieldAction("tkt_1", "problemType", "Exorcism");
    expect(refused).toEqual({
      error: "That is not one of this shop's problem types.",
    });
    expect(callsTo("ticket.updateMany")).toEqual([]);
  });
});

describe("setTicketFieldAction — validation", () => {
  it("stores a date-only due date as LOCAL midnight, not UTC", async () => {
    stubScopedUpdate("ticket.updateMany");

    await setTicketFieldAction("tkt_1", "dueDate", "2026-09-08");

    const due = dataOf("ticket.updateMany").dueDate as Date;
    expect(due).toBeInstanceOf(Date);
    // Read back through the LOCAL getters, which is how the app renders it.
    // `new Date("2026-09-08")` would be the 7th here for any negative offset.
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(8);
    expect(due.getDate()).toBe(8);
    expect(due.getHours()).toBe(0);
    expect(due.getMinutes()).toBe(0);
  });

  it("clears the due date on an empty value rather than refusing", async () => {
    stubScopedUpdate("ticket.updateMany");

    const result = await setTicketFieldAction("tkt_1", "dueDate", "   ");

    expect(result.ok).toBe(true);
    expect(dataOf("ticket.updateMany")).toEqual({ dueDate: null });
  });

  it("refuses a date that is not a real day instead of silently clearing it", async () => {
    // The Date constructor rolls 2026-02-31 forward to March 3. Storing the
    // wrong day is worse than refusing, and so is quietly writing null.
    for (const bad of ["2026-02-31", "08/24/2026", "tomorrow", "2026-13-01"]) {
      resetDb();
      const result = await setTicketFieldAction("tkt_1", "dueDate", bad);
      expect(result, bad).toEqual({ error: "That is not a date. Use YYYY-MM-DD." });
      expect(calls, bad).toEqual([]);
    }
  });

  it("refuses a priority outside the enum instead of coercing it to NORMAL", async () => {
    // `asPriority` answers NORMAL for anything unknown — right for a form
    // default, wrong here, where it would quietly demote an URGENT job.
    const result = await setTicketFieldAction("tkt_1", "priority", "CRITICAL");

    expect(result).toEqual({ error: "That is not a priority." });
    expect(calls).toEqual([]);
  });

  it("clears the assignee on an empty value", async () => {
    stubScopedUpdate("ticket.updateMany");

    const result = await setTicketFieldAction("tkt_1", "assignedToId", "");

    expect(result.ok).toBe(true);
    expect(dataOf("ticket.updateMany")).toEqual({ assignedToId: null });
    // No lookup needed to unassign.
    expect(callsTo("user.findFirst")).toEqual([]);
  });
});

describe("setCustomerFieldAction — the allow-list", () => {
  const OFF_LIST = [
    "shopId",
    "id",
    // Money the credit ledger is supposed to produce.
    "creditBalanceCents",
    // A handle to a real card at Stripe.
    "stripePaymentMethodId",
    // Half of the address unit, which belongs to the form that validates it
    // whole.
    "address1",
    "taxExempt",
  ];

  for (const field of OFF_LIST) {
    it(`refuses "${field}" without touching the database`, async () => {
      stubScopedUpdate("customer.updateMany");

      const result = await setCustomerFieldAction("cus_1", field, "shop_2");

      expect(result).toEqual({
        ok: false,
        error: "That field can't be edited from here.",
      });
      expect(calls).toEqual([]);
    });
  }

  it("accepts exactly three names and no others", async () => {
    const accepted: string[] = [];
    for (const field of ["phone", "email", "referredBy"]) {
      resetDb();
      stubScopedUpdate("customer.updateMany");

      const value = field === "email" ? "a@b.com" : "anything";
      const result = await setCustomerFieldAction("cus_1", field, value);
      if (result.ok) accepted.push(field);
    }

    expect(accepted).toEqual(["phone", "email", "referredBy"]);
  });
});

describe("setCustomerFieldAction — tenancy", () => {
  it("scopes the write to the session's shop", async () => {
    stubScopedUpdate("customer.updateMany");

    const result = await setCustomerFieldAction("cus_1", "referredBy", "Walk-in");

    expect(result).toEqual({ ok: true });
    expect(whereOf("customer.updateMany")).toEqual({ id: "cus_1", shopId: SHOP });
    expect(dataOf("customer.updateMany")).toEqual({ referredBy: "Walk-in" });
  });

  it("writes nothing for a customer id belonging to another shop", async () => {
    handlers["customer.updateMany"] = () => ({ count: 0 });

    const result = await setCustomerFieldAction("cus_from_shop_2", "phone", "555-0100");

    expect(result).toEqual({ ok: false, error: "Customer not found." });
  });
});

describe("setCustomerFieldAction — validation", () => {
  it("stores an email lowercased, as the customer form does", async () => {
    stubScopedUpdate("customer.updateMany");

    await setCustomerFieldAction("cus_1", "email", "  Dana@Example.COM ");

    expect(dataOf("customer.updateMany")).toEqual({ email: "dana@example.com" });
  });

  it("refuses an address that is not one", async () => {
    const result = await setCustomerFieldAction("cus_1", "email", "dana@");

    expect(result).toEqual({ ok: false, error: "Enter a valid email address." });
    expect(calls).toEqual([]);
  });

  it("clears a column on an empty value rather than leaving it unchanged", async () => {
    // `undefined` means "leave unchanged" to Prisma, which would make deleting
    // a wrong address impossible from the field that shows it.
    for (const field of ["phone", "email", "referredBy"]) {
      resetDb();
      stubScopedUpdate("customer.updateMany");

      await setCustomerFieldAction("cus_1", field, "");

      expect(dataOf("customer.updateMany"), field).toEqual({ [field]: null });
    }
  });

  it("refuses values longer than the column allows", async () => {
    const long = await setCustomerFieldAction("cus_1", "phone", "9".repeat(41));
    expect(long).toEqual({
      ok: false,
      error: "A phone number can be 40 characters at most.",
    });
    expect(calls).toEqual([]);
  });
});
