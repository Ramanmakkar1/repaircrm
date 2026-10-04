import { beforeEach, describe, expect, it, vi } from "vitest";

import { GENERATE_SKU } from "@/components/import/fields";

/**
 * components/import/commit.ts — one bad row must not sink its neighbours, the
 * summary must equal what was really saved, and updates carry the shop id.
 *
 * tests/helpers/db-mock.ts deliberately does not model rollback, which is the
 * whole point here, so this file has its own small transactional fake that
 * behaves like Postgres: writes inside `$transaction` are staged and only join
 * `committed` when the transaction commits; once ONE statement fails, every
 * later statement in that transaction is refused (SQLSTATE 25P02) and, if the
 * callback swallowed the error and returned, the COMMIT quietly becomes a
 * ROLLBACK. That last part is what made a try/catch inside the batch
 * transaction over-report: it counted rows that Postgres then threw away.
 */

type Row = Record<string, unknown> & { id: string };
type Call = { path: string; args: Record<string, unknown> };

const world = vi.hoisted(() => ({
  db: null as unknown as Record<string, unknown>,
}));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: (_target, key) => (world.db as Record<string | symbol, unknown>)[key] }),
}));

const { commitImport } = await import("@/components/import/commit");

type Fake = {
  committed: { product: Row[]; vendor: Row[]; customer: Row[]; stockAdjustment: Row[] };
  calls: Call[];
  transactions: number;
};

/**
 * `failWhen` decides which create() calls blow up; `seed` is what the shop
 * already has; `updateCount` is what updateMany reports.
 */
function installFakeDb(options: {
  failWhen?: (path: string, data: Record<string, unknown>) => Error | null;
  seed?: { customer?: Row[]; product?: Row[] };
  updateCount?: number;
} = {}): Fake {
  const committed: Fake["committed"] = {
    product: [...(options.seed?.product ?? [])],
    vendor: [],
    customer: [...(options.seed?.customer ?? [])],
    stockAdjustment: [],
  };
  const fake: Fake = { committed, calls: [], transactions: 0 };
  let nextId = 0;

  // `staged` is where a transaction's writes wait; outside a transaction the
  // importer only reads, so reads see `committed` alone. `state.aborted` is
  // Postgres's "current transaction is aborted" flag.
  const client = (staged: Fake["committed"] | null, state = { aborted: false }) => {
    const visible = (table: keyof Fake["committed"]) => [
      ...committed[table],
      ...(staged ? staged[table] : []),
    ];
    const refuseIfAborted = () => {
      if (state.aborted) {
        throw Object.assign(new Error("current transaction is aborted, commands ignored until end of transaction block"), { code: "25P02" });
      }
    };
    const create = (table: keyof Fake["committed"]) => async (args: Record<string, unknown>) => {
      refuseIfAborted();
      const path = `${table}.create`;
      fake.calls.push({ path, args });
      const data = args.data as Record<string, unknown>;
      const failure = options.failWhen?.(path, data);
      if (failure) {
        state.aborted = true;
        throw failure;
      }
      const row: Row = { id: `${table}_${++nextId}`, ...data };
      (staged ?? committed)[table].push(row);
      return { id: row.id };
    };
    const updateMany = (table: keyof Fake["committed"]) => async (args: Record<string, unknown>) => {
      refuseIfAborted();
      fake.calls.push({ path: `${table}.updateMany`, args });
      return { count: options.updateCount ?? 1 };
    };
    return {
      customer: {
        findMany: async () => visible("customer"),
        create: create("customer"),
        updateMany: updateMany("customer"),
      },
      product: {
        findMany: async () => visible("product").filter((row) => row.sku),
        create: create("product"),
        updateMany: updateMany("product"),
      },
      vendor: {
        findFirst: async (args: { where: { name: { equals: string } } }) => {
          refuseIfAborted();
          fake.calls.push({ path: "vendor.findFirst", args });
          const wanted = args.where.name.equals.toLowerCase();
          const found = visible("vendor").find((row) => String(row.name).toLowerCase() === wanted);
          return found ? { id: found.id } : null;
        },
        create: create("vendor"),
      },
      stockAdjustment: { create: create("stockAdjustment") },
    };
  };

  world.db = {
    ...client(null),
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      fake.transactions += 1;
      const staged: Fake["committed"] = { product: [], vendor: [], customer: [], stockAdjustment: [] };
      const state = { aborted: false };
      // A callback that throws rolls back and rejects.
      const result = await callback(client(staged, state));
      // One that returns after a failed statement is "committed" as a rollback.
      if (!state.aborted) {
        for (const table of Object.keys(staged) as (keyof Fake["committed"])[]) {
          committed[table].push(...staged[table]);
        }
      }
      return result;
    },
  };
  return fake;
}

const prismaStyleError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

const productBatch = (rows: string[][], headerRow = 1) => ({
  id: "a".repeat(32),
  shopId: "shop_1",
  kind: "products" as const,
  fileName: "stock.csv",
  createdAt: Date.now(),
  headers: ["Item", "SKU", "Vendor", "Price", "Qty"],
  rows,
  headerRow,
});
const productMapping = { name: 0, sku: 1, vendor: 2, priceCents: 3, stockQty: 4 };

const part = (name: string, sku: string, vendor = "") => [name, sku, vendor, "10.00", "2"];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("commitImport when every row is fine", () => {
  it("saves the whole batch in a single transaction", async () => {
    const fake = installFakeDb();
    const rows = ["A", "B", "C", "D", "E"].map((name) => part(`Part ${name}`, `SKU-${name}`));

    const summary = await commitImport("shop_1", productBatch(rows), productMapping, "skip");

    expect(summary).toEqual({ created: 5, updated: 0, skipped: 0, errors: [] });
    expect(fake.transactions).toBe(1);
    expect(fake.committed.product).toHaveLength(5);
  });
});

describe("commitImport when one row throws", () => {
  const badPart = (data: Record<string, unknown>) =>
    data.name === "Part BAD"
      ? prismaStyleError("P2002", "Unique constraint failed on the fields: (`shopId`,`sku`)")
      : null;

  it("still saves the other rows, counts exactly what was saved and lists the bad row in plain words", async () => {
    const fake = installFakeDb({ failWhen: (path, data) => (path === "product.create" ? badPart(data) : null) });
    const rows = [
      part("Part 1", "SKU-1"),
      part("Part 2", "SKU-2"),
      part("Part BAD", "SKU-BAD"),
      part("Part 4", "SKU-4"),
      part("Part 5", "SKU-5"),
    ];

    const summary = await commitImport("shop_1", productBatch(rows, 3), productMapping, "skip");

    // What the summary says equals what is actually in the database...
    expect(summary.created).toBe(4);
    expect(summary.updated).toBe(0);
    expect(summary.created).toBe(fake.committed.product.length);
    // ...each good row exactly once (the rolled-back batch left nothing behind)...
    expect(fake.committed.product.map((row) => row.name)).toEqual(["Part 1", "Part 2", "Part 4", "Part 5"]);
    expect(fake.committed.stockAdjustment).toHaveLength(4);
    // ...and the bad row is listed against its row in the file (header on row 3, so data starts on 4).
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toEqual([
      { row: 6, message: "Something with the same code, email or phone is already on file." },
    ]);
    expect(summary.errors[0].message).not.toMatch(/prisma|constraint|P2002|shopId/i);
  });

  it("gives an unrecognised database failure a generic, plain message", async () => {
    installFakeDb({
      failWhen: (path, data) => (path === "product.create" && data.name === "Part BAD" ? new Error("connection terminated unexpectedly") : null),
    });
    const summary = await commitImport(
      "shop_1",
      productBatch([part("Part 1", "SKU-1"), part("Part BAD", "SKU-BAD")]),
      productMapping,
      "skip",
    );
    expect(summary.created).toBe(1);
    expect(summary.errors).toEqual([{ row: 3, message: "Couldn't save this row. Check its values and try again." }]);
  });

  it("forgets what the rolled-back batch registered, so a later duplicate is judged against what really exists", async () => {
    const fake = installFakeDb({ failWhen: (path, data) => (path === "product.create" ? badPart(data) : null) });
    const rows = [
      part("Part A", "SKU-A"),
      part("Part BAD", "SKU-BAD"),
      // Same SKU as the first row: a genuine in-file duplicate, skipped once the
      // first row has really been saved — not skipped because of a ghost.
      part("Part A again", "sku-a"),
    ];

    const summary = await commitImport("shop_1", productBatch(rows), productMapping, "skip");

    expect(fake.committed.product.map((row) => row.name)).toEqual(["Part A"]);
    expect(summary).toMatchObject({ created: 1, updated: 0, skipped: 2 });
    expect(summary.errors).toHaveLength(1);
  });

  it("creates a vendor named in a rolled-back batch again, and points the saved products at the vendor that exists", async () => {
    const fake = installFakeDb({ failWhen: (path, data) => (path === "product.create" ? badPart(data) : null) });
    const rows = [
      part("Part 1", "SKU-1", "Acme Parts"),
      part("Part BAD", "SKU-BAD", "Acme Parts"),
      part("Part 3", "SKU-3", "acme parts"),
    ];

    const summary = await commitImport("shop_1", productBatch(rows), productMapping, "skip");

    expect(summary.created).toBe(2);
    expect(fake.committed.vendor).toHaveLength(1);
    const vendorId = fake.committed.vendor[0].id;
    expect(fake.committed.product.map((row) => row.vendorId)).toEqual([vendorId, vendorId]);
  });

  it("keeps later batches on the fast path and numbers errors across batches", async () => {
    const fake = installFakeDb({ failWhen: (path, data) => (path === "product.create" ? badPart(data) : null) });
    const rows = Array.from({ length: 250 }, (_, index) =>
      part(index === 210 ? "Part BAD" : `Part ${index}`, `SKU-${index}`),
    );

    const summary = await commitImport("shop_1", productBatch(rows), productMapping, "skip");

    expect(summary.created).toBe(249);
    expect(summary.created).toBe(fake.committed.product.length);
    expect(summary.errors).toEqual([expect.objectContaining({ row: 212 })]);
    // Batch 1 (200 rows) = 1 transaction. Batch 2 (50 rows) fails once, then
    // is replayed as 50 one-row transactions.
    expect(fake.transactions).toBe(1 + 1 + 50);
  });

  it("does not open a transaction for a row that was already settled (invalid or a skipped duplicate)", async () => {
    const fake = installFakeDb({ failWhen: (path, data) => (path === "product.create" ? badPart(data) : null) });
    const rows = [
      part("Part 1", "SKU-1"),
      ["", "SKU-X", "", "1.00", "1"], // no name: invalid
      part("Part BAD", "SKU-BAD"),
    ];

    const summary = await commitImport("shop_1", productBatch(rows), productMapping, "skip");

    expect(summary.created).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.errors.map((error) => error.row)).toEqual([3, 4]);
    // 1 whole-batch attempt + a transaction for the 2 rows that need the database.
    expect(fake.transactions).toBe(3);
  });

  it("isolates a failing customer row the same way", async () => {
    const fake = installFakeDb({
      failWhen: (path, data) => (path === "customer.create" && data.firstName === "Bad" ? new Error("boom") : null),
    });
    const batch = {
      ...productBatch([["Ann", "ann@x.com"], ["Bad", "bad@x.com"], ["Cy", "cy@x.com"]]),
      kind: "customers" as const,
      headers: ["First", "Email"],
    };

    const summary = await commitImport("shop_1", batch, { firstName: 0, email: 1 }, "skip");

    expect(summary.created).toBe(2);
    expect(fake.committed.customer.map((row) => row.firstName)).toEqual(["Ann", "Cy"]);
    expect(summary.errors).toEqual([expect.objectContaining({ row: 3 })]);
  });
});

describe("commitImport updates are scoped to the shop", () => {
  it("updates a duplicate customer with updateMany on { id, shopId }", async () => {
    const fake = installFakeDb({ seed: { customer: [{ id: "cust_9", email: "ann@x.com", phone: null, mobile: null }] } });
    const batch = {
      ...productBatch([["Ann", "ann@x.com", "Lee"]]),
      kind: "customers" as const,
      headers: ["First", "Email", "Last"],
    };

    const summary = await commitImport("shop_1", batch, { firstName: 0, email: 1, lastName: 2 }, "update");

    expect(summary).toEqual({ created: 0, updated: 1, skipped: 0, errors: [] });
    const [call] = fake.calls.filter((entry) => entry.path === "customer.updateMany");
    expect(call.args.where).toEqual({ id: "cust_9", shopId: "shop_1" });
    expect(call.args.data).toMatchObject({ firstName: "Ann", lastName: "Lee" });
  });

  it("updates a duplicate product with updateMany on { id, shopId }, leaving stock alone", async () => {
    const fake = installFakeDb({ seed: { product: [{ id: "prod_9", sku: "SKU-1" }] } });

    const summary = await commitImport(
      "shop_1",
      productBatch([part("New name", "sku-1")]),
      productMapping,
      "update",
    );

    expect(summary).toEqual({ created: 0, updated: 1, skipped: 0, errors: [] });
    const [call] = fake.calls.filter((entry) => entry.path === "product.updateMany");
    expect(call.args.where).toEqual({ id: "prod_9", shopId: "shop_1" });
    expect(call.args.data).toMatchObject({ name: "New name", priceCents: 1000 });
    expect(call.args.data).not.toHaveProperty("stockQty");
  });

  it("reports a row whose record is not in this shop (nothing matched) instead of counting it as updated", async () => {
    installFakeDb({ seed: { product: [{ id: "prod_other", sku: "SKU-1" }] }, updateCount: 0 });

    const summary = await commitImport(
      "shop_1",
      productBatch([part("Renamed", "SKU-1")]),
      productMapping,
      "update",
    );

    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toEqual([
      { row: 2, message: "That product was removed while the import was running." },
    ]);
  });

  it("generated product codes still work through the isolated path", async () => {
    const fake = installFakeDb();
    const summary = await commitImport(
      "shop_1",
      productBatch([["Screen guard", "", "", "5.00", "1"]]),
      { ...productMapping, sku: GENERATE_SKU },
      "skip",
    );
    expect(summary.created).toBe(1);
    expect(String(fake.committed.product[0].sku)).toMatch(/^IMP-/);
  });
});
