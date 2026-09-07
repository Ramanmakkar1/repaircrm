import { beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@prisma/client";

import {
  applyTicketDeposits,
  commitTicketDeposits,
  planTicketDeposits,
  recordCreditSpend,
} from "@/lib/deposits";
import { markInvoiceSerialsSold, syncSerializedStock } from "@/lib/serials";
import { nextNumber, type SequenceKind } from "@/lib/sequence";

import { calls, fakeClient, handlers, resetDb } from "./helpers/db-mock";

/**
 * MULTI-TENANCY — the worst bug this app can have.
 *
 * lib/db.ts sets the rule out: every tenant-owned row carries a `shopId`, every
 * query filters by the SESSION's shopId, a lookup by id is a `findFirst({ where:
 * { id, shopId } })` so a guessed id from another shop 404s instead of leaking,
 * and a `shopId` that arrived over the wire is never trusted.
 *
 * The helpers below are the representative ones: they take an injectable
 * transaction client, several unrelated call sites reach them, and every one of
 * those call sites is a money path. Because they take a `tx`, the tenant filter
 * can be asserted on the ARGUMENTS rather than inferred from what came back —
 * a real query with a missing `shopId` still returns a row and still passes.
 *
 * The remaining coverage lives beside the code it belongs to:
 *   lib/payments/record.ts, lib/payments/settle.ts  tests/payments-*.test.ts
 *   app/(app)/pos/checkout.ts                       tests/pos-*.test.ts
 */

const SHOP = "shop_1";
const OTHER = "shop_2";

/** Child rows reachable only through an already-scoped parent. See lib/db.ts. */
const SCOPED_BY_PARENT = new Set(["invoiceLine.findMany"]);

/** Writes whose row carries its shopId in `data`, not in `where`. */
const SCOPED_BY_DATA = new Set([
  "creditAdjustment.create",
  "payment.create",
  "stockAdjustment.create",
]);

/**
 * The assertion this whole file exists for: no query issued by the code under
 * test may omit the tenant, and none may name a different one.
 */
function expectEveryQueryScoped(shopId: string): void {
  for (const call of calls) {
    if (call.path === "$transaction") continue;
    if (SCOPED_BY_PARENT.has(call.path)) continue;

    const bag = SCOPED_BY_DATA.has(call.path)
      ? ((call.args.data ?? {}) as Record<string, unknown>)
      : ((call.args.where ?? {}) as Record<string, unknown>);

    // `update`/`delete` by primary key are allowed only when the row was
    // fetched through a shop-scoped read first — flagged here so a new one has
    // to be looked at rather than slipping in.
    if (/\.(update|delete)$/.test(call.path)) {
      expect(Object.keys((call.args.where ?? {}) as object)).toEqual(["id"]);
      continue;
    }

    expect(
      bag.shopId,
      `${call.path} is not scoped to a shop: ${JSON.stringify(call.args)}`,
    ).toBe(shopId);
  }
}

const tx = fakeClient as unknown as Prisma.TransactionClient;

beforeEach(() => {
  resetDb();
});

describe("lib/sequence.ts — document numbering", () => {
  const KINDS: SequenceKind[] = ["ticket", "estimate", "invoice", "purchaseOrder"];

  it("scopes the max-number read for every document kind", async () => {
    for (const kind of KINDS) {
      resetDb();
      handlers[`${kind}.aggregate`] = () => ({ _max: { number: 1_000 } });

      await nextNumber(SHOP, kind, tx);

      expectEveryQueryScoped(SHOP);
    }
  });

  it("gives two shops independent sequences from the same table", async () => {
    const maxByShop: Record<string, number> = { [SHOP]: 1_500, [OTHER]: 1_001 };
    handlers["invoice.aggregate"] = (args) => {
      const where = (args.where ?? {}) as { shopId?: string };
      return { _max: { number: maxByShop[where.shopId ?? ""] ?? null } };
    };

    expect(await nextNumber(SHOP, "invoice", tx)).toBe(1_501);
    expect(await nextNumber(OTHER, "invoice", tx)).toBe(1_002);
  });
});

describe("lib/deposits.ts — money held for a customer", () => {
  const input = {
    shopId: SHOP,
    ticketId: "tkt_1",
    customerId: "cus_1",
    totalCents: 10_000,
  };

  function stubDeposits(): void {
    handlers["deposit.findMany"] = () => [{ id: "dep_1", amountCents: 4_000 }];
    handlers["customer.findFirst"] = () => ({ creditBalanceCents: 10_000 });
  }

  it("scopes the deposit and credit reads while planning", async () => {
    stubDeposits();

    const plan = await planTicketDeposits(tx, input);

    expect(plan).toEqual({ amountCents: 4_000, depositIds: ["dep_1"] });
    expectEveryQueryScoped(SHOP);
  });

  it("finds nothing for a ticket that belongs to another shop", async () => {
    // The scoped read is what makes this true — a cross-tenant ticket id simply
    // matches no deposit rows.
    handlers["deposit.findMany"] = (args) => {
      const where = (args.where ?? {}) as { shopId?: string };
      return where.shopId === SHOP ? [{ id: "dep_1", amountCents: 4_000 }] : [];
    };
    handlers["customer.findFirst"] = () => ({ creditBalanceCents: 10_000 });

    expect(await planTicketDeposits(tx, { ...input, shopId: OTHER })).toEqual({
      amountCents: 0,
      depositIds: [],
    });
  });

  it("scopes every write when the plan is committed", async () => {
    handlers["customer.update"] = () => ({ id: "cus_1" });
    handlers["creditAdjustment.create"] = () => ({ id: "adj_1" });
    handlers["payment.create"] = () => ({ id: "pay_1" });
    handlers["deposit.updateMany"] = () => ({ count: 1 });

    await commitTicketDeposits(
      tx,
      { amountCents: 4_000, depositIds: ["dep_1"] },
      {
        shopId: SHOP,
        customerId: "cus_1",
        ticketNumber: 1042,
        invoiceId: "inv_1",
        invoiceNumber: 1042,
        userId: "user_1",
      },
    );

    expectEveryQueryScoped(SHOP);
  });

  it("scopes both halves of plan-and-commit", async () => {
    stubDeposits();
    handlers["customer.update"] = () => ({ id: "cus_1" });
    handlers["creditAdjustment.create"] = () => ({ id: "adj_1" });
    handlers["payment.create"] = () => ({ id: "pay_1" });
    handlers["deposit.updateMany"] = () => ({ count: 1 });

    await applyTicketDeposits(tx, {
      ...input,
      ticketNumber: 1042,
      invoiceId: "inv_1",
      invoiceNumber: 1042,
      userId: "user_1",
    });

    expectEveryQueryScoped(SHOP);
  });

  it("stamps the shop onto the credit ledger row", async () => {
    handlers["creditAdjustment.create"] = () => ({ id: "adj_1" });

    await recordCreditSpend(tx, {
      shopId: SHOP,
      customerId: "cus_1",
      amountCents: 4_000,
      invoiceNumber: 1042,
      userId: "user_1",
    });

    expectEveryQueryScoped(SHOP);
  });

  it("writes nothing at all for a zero spend", async () => {
    await recordCreditSpend(tx, {
      shopId: SHOP,
      customerId: "cus_1",
      amountCents: 0,
      invoiceNumber: 1042,
      userId: null,
    });

    expect(calls).toEqual([]);
  });
});

describe("lib/serials.ts — physical units", () => {
  it("scopes the serial lookup when marking units sold", async () => {
    handlers["invoiceLine.findMany"] = () => [
      { id: "line_1", productId: "prod_1", serial: "SN-1" },
    ];
    handlers["productSerial.findFirst"] = () => ({ id: "ser_1" });
    handlers["productSerial.update"] = () => ({ id: "ser_1" });

    const moved = await markInvoiceSerialsSold(tx, {
      shopId: SHOP,
      invoiceId: "inv_1",
    });

    expect(moved).toEqual([{ productId: "prod_1", serial: "SN-1" }]);
    expectEveryQueryScoped(SHOP);
  });

  it("refuses a serial that is not in stock FOR THIS SHOP", async () => {
    handlers["invoiceLine.findMany"] = () => [
      { id: "line_1", productId: "prod_1", serial: "SN-1" },
    ];
    // The scoped read is what turns another tenant's unit into "not in stock".
    handlers["productSerial.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { shopId?: string };
      return where.shopId === SHOP ? { id: "ser_1" } : null;
    };
    handlers["productSerial.update"] = () => ({ id: "ser_1" });

    await expect(
      markInvoiceSerialsSold(tx, { shopId: OTHER, invoiceId: "inv_1" }),
    ).rejects.toThrow("Serial SN-1 is not in stock");
  });

  it("scopes the recount and the correcting adjustment", async () => {
    handlers["product.findMany"] = () => [{ id: "prod_1", stockQty: 3 }];
    handlers["productSerial.count"] = () => 2;
    handlers["product.update"] = () => ({ id: "prod_1" });
    handlers["stockAdjustment.create"] = () => ({ id: "adj_1" });

    await syncSerializedStock(tx, {
      shopId: SHOP,
      userId: "user_1",
      productIds: ["prod_1"],
      reason: "Sold — invoice #1042",
    });

    expectEveryQueryScoped(SHOP);
    expect(
      (calls.find((call) => call.path === "stockAdjustment.create")
        ?.args.data as { delta: number }).delta,
    ).toBe(-1);
  });

  it("touches nothing when there is nothing to reconcile", async () => {
    await syncSerializedStock(tx, {
      shopId: SHOP,
      userId: null,
      productIds: [],
      reason: "noop",
    });

    expect(calls).toEqual([]);
  });
});

describe("the guard itself", () => {
  it("fails when a query forgets the tenant, so these tests can be trusted", async () => {
    // A deliberately unscoped read, to prove the assertion above is not vacuous.
    handlers["deposit.findMany"] = () => [];
    await (fakeClient.deposit as { findMany: (a: object) => Promise<unknown> })
      .findMany({ where: { ticketId: "tkt_1" } });

    expect(() => expectEveryQueryScoped(SHOP)).toThrow();
  });
});
