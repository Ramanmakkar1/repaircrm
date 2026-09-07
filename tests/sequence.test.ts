import { beforeEach, describe, expect, it, vi } from "vitest";

import { nextNumber, withNextNumber, type SequenceKind } from "@/lib/sequence";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

/**
 * lib/sequence.ts — per-shop document numbering.
 *
 * Tickets, estimates, invoices and purchase orders each get their own sequence
 * starting at 1000 WITHIN a shop. The number is max(number) + 1, and the real
 * guarantee is the database's @@unique([shopId, number]): if two registers race,
 * the loser takes a unique violation and retries rather than silently issuing a
 * duplicate invoice number.
 *
 * The retry loop is the part worth testing, because it is the part that makes
 * the optimistic read safe.
 */

const SHOP = "shop_1";
const KINDS: SequenceKind[] = ["ticket", "estimate", "invoice", "purchaseOrder"];

/** The Prisma error the unique constraint produces. */
function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function stubMax(kind: SequenceKind, max: number | null): void {
  handlers[`${kind}.aggregate`] = () => ({ _max: { number: max } });
}

beforeEach(() => {
  resetDb();
});

describe("nextNumber", () => {
  it("starts a brand-new shop at 1000", async () => {
    for (const kind of KINDS) {
      resetDb();
      stubMax(kind, null);
      expect(await nextNumber(SHOP, kind)).toBe(1000);
    }
  });

  it("continues from the highest number already issued", async () => {
    for (const kind of KINDS) {
      resetDb();
      stubMax(kind, 1042);
      expect(await nextNumber(SHOP, kind)).toBe(1043);
    }
  });

  it("keeps the four sequences independent", async () => {
    stubMax("ticket", 1500);
    stubMax("invoice", 1002);

    expect(await nextNumber(SHOP, "ticket")).toBe(1501);
    expect(await nextNumber(SHOP, "invoice")).toBe(1003);
  });

  it("scopes the max to the shop, so one tenant cannot push another's numbering", async () => {
    for (const kind of KINDS) {
      resetDb();
      stubMax(kind, 5);
      await nextNumber(SHOP, kind);
      expect(whereOf(`${kind}.aggregate`)).toEqual({ shopId: SHOP });
    }
  });

  it("opens its own transaction when no tx is supplied", async () => {
    stubMax("invoice", 1000);
    await nextNumber(SHOP, "invoice");
    expect(callsTo("$transaction")).toHaveLength(1);
  });

  it("reuses a caller's transaction when one is supplied", async () => {
    stubMax("invoice", 1000);

    const { fakeClient } = await import("./helpers/db-mock");
    const tx = fakeClient as unknown as Parameters<typeof nextNumber>[2];
    expect(await nextNumber(SHOP, "invoice", tx)).toBe(1001);

    // Passing `tx` is how a caller keeps the read and the insert atomic; it
    // must not open a nested transaction of its own.
    expect(callsTo("$transaction")).toHaveLength(0);
  });
});

describe("withNextNumber", () => {
  it("hands the allocated number to the create callback and returns its result", async () => {
    stubMax("invoice", 1041);

    const created = await withNextNumber(SHOP, "invoice", async (number) => ({
      id: "inv_1",
      number,
    }));

    expect(created).toEqual({ id: "inv_1", number: 1042 });
  });

  it("RETRIES with a fresh number when the unique constraint rejects it", async () => {
    // Another register took 1042 between our read and our insert.
    let taken = 1041;
    handlers["invoice.aggregate"] = () => ({ _max: { number: taken } });

    const attempts: number[] = [];
    const created = await withNextNumber(SHOP, "invoice", async (number) => {
      attempts.push(number);
      if (number === 1042) {
        taken = 1042; // the winner's row is now visible
        throw uniqueViolation();
      }
      return number;
    });

    expect(attempts).toEqual([1042, 1043]);
    expect(created).toBe(1043);
  });

  it("gives up after five attempts and rethrows the violation", async () => {
    stubMax("invoice", 1041);
    let attempts = 0;

    await expect(
      withNextNumber(SHOP, "invoice", async () => {
        attempts += 1;
        throw uniqueViolation();
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(attempts).toBe(5);
  });

  it("rethrows anything that is NOT a unique violation immediately", async () => {
    stubMax("invoice", 1041);
    let attempts = 0;

    await expect(
      withNextNumber(SHOP, "invoice", async () => {
        attempts += 1;
        throw new Error("the customer no longer exists");
      }),
    ).rejects.toThrow("the customer no longer exists");

    // No retry: retrying a business failure would just fail four more times.
    expect(attempts).toBe(1);
  });

  it("does not collide when several allocations race for the same sequence", async () => {
    // A stand-in for @@unique([shopId, number]): the FIRST insert of a number
    // wins and every later one raises P2002, exactly as Postgres would.
    const issued = new Set<number>();
    handlers["invoice.aggregate"] = () => ({
      _max: { number: issued.size ? Math.max(...issued) : null },
    });

    const create = async (number: number) => {
      // Yield, so the reads of the concurrent allocations genuinely interleave
      // and every one of them sees the same stale max.
      await Promise.resolve();
      if (issued.has(number)) throw uniqueViolation();
      issued.add(number);
      return number;
    };

    const numbers = await Promise.all(
      Array.from({ length: 5 }, () => withNextNumber(SHOP, "invoice", create)),
    );

    expect(new Set(numbers).size).toBe(numbers.length);
    expect([...numbers].sort((a, b) => a - b)).toEqual([
      1000, 1001, 1002, 1003, 1004,
    ]);
  });
});
