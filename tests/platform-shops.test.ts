import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calls, callsTo, handlers, resetDb, type DbCall } from "./helpers/db-mock";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), readUpload: vi.fn(), stat: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient };
});
vi.mock("@/lib/platform-admin", () => ({ requirePlatformAdmin: mocks.admin }));
vi.mock("@/lib/storage", () => ({ readUpload: mocks.readUpload }));
vi.mock("node:fs/promises", () => ({ stat: mocks.stat, default: { stat: mocks.stat } }));

const { STORAGE_REFRESH_MS, readActivityFeed, readPlatformOverview, readShopDetail, readShopDirectory, recountStorage } =
  await import("@/lib/platform-shops");

const DAY = 24 * 60 * 60 * 1000;
let clock = new Date("2026-11-01T12:00:00Z").getTime();
const daysAgo = (days: number) => new Date(clock - days * DAY);

/** The columns the footprint discovery query sees. */
const CATALOG = ["Shop.id", "Ticket.id", "Ticket.shopId", "Invoice.id", "Invoice.shopId", "InvoiceLine.invoiceId"].map((pair) => {
  const [table, column] = pair.split(".");
  return { table, column };
});

const isFootprint = (sql: string) => sql.includes("pg_column_size(t.*)");

/**
 * A platform of `count` shops. Shop s0 has files, a logo and records; the
 * rest are empty apart from one owner each.
 */
function platform(count: number, options: { footprintFails?: boolean } = {}) {
  const ids = Array.from({ length: count }, (_, index) => `s${index}`);
  handlers["shop.findMany"] = (args) => {
    const select = args.select as Record<string, unknown>;
    if (args.where && "logoPath" in (args.where as object)) {
      return [{ id: "s0", logoPath: `/uploads/s0/${"a".repeat(32)}.png`, logoStorage: "local" }];
    }
    if (select.users) return [];
    return ids.map((id, index) => ({
      id,
      name: `Shop ${index}`,
      slug: `shop-${index}`,
      createdAt: daysAgo(100 + index),
      currency: index === 1 ? "cad" : "usd",
      city: null,
      country: "US",
      deletionRequestedAt: null,
      deletionPurgeAfter: null,
    }));
  };
  handlers["user.findMany"] = () => ids.map((id) => ({ shopId: id, name: `Owner ${id}`, email: `${id}@shop.example` }));
  handlers["user.groupBy"] = () => [
    ...ids.map((id) => ({ shopId: id, active: true, _count: { _all: 1 }, _max: { lastLoginAt: id === "s0" ? daysAgo(1) : null } })),
    { shopId: "s0", active: false, _count: { _all: 2 }, _max: { lastLoginAt: daysAgo(400) } },
  ];
  handlers["customer.groupBy"] = () => [{ shopId: "s0", _count: { _all: 7 }, _max: { createdAt: daysAgo(50) } }];
  handlers["ticket.groupBy"] = () => [{ shopId: "s0", _count: { _all: 4 }, _max: { createdAt: daysAgo(60) } }];
  handlers["invoice.groupBy"] = (args) =>
    args._max ? [{ shopId: "s0", _max: { createdAt: daysAgo(70) } }] : [{ shopId: "s0", _count: { _all: 3 } }];
  handlers["product.groupBy"] = () => [{ shopId: "s0", _count: { _all: 9 } }];
  handlers["payment.groupBy"] = (args) =>
    args.where
      ? [
          { shopId: "s0", _count: { _all: 1 }, _sum: { amountCents: 2_500 } },
          { shopId: "s1", _count: { _all: 2 }, _sum: { amountCents: 4_000 } },
        ]
      : [
          { shopId: "s0", _count: { _all: 5 }, _sum: { amountCents: 10_000 }, _max: { createdAt: daysAgo(80) } },
          { shopId: "s1", _count: { _all: 2 }, _sum: { amountCents: 4_000 }, _max: { createdAt: daysAgo(90) } },
        ];
  handlers["auditLog.groupBy"] = () => [{ shopId: "s0", _max: { createdAt: daysAgo(5) } }];
  handlers["attachment.groupBy"] = () => [{ shopId: "s0", _count: { _all: 2 }, _sum: { sizeBytes: 3_000 } }];
  handlers["automaticProductPhoto.groupBy"] = () => [{ shopId: "s0", _count: { _all: 1 }, _sum: { sizeBytes: 1_000 } }];
  handlers["ticket.count"] = () => 2;
  handlers["invoice.count"] = () => 1;
  handlers["user.count"] = () => 1;
  handlers["productFeedback.count"] = () => 4;
  handlers["productFeedback.findMany"] = () => [];
  handlers["auditLog.findMany"] = () => [];
  handlers["$executeRaw"] = () => 0;
  handlers["$queryRaw"] = ({ sql }) => {
    const text = String(sql);
    if (text.includes("information_schema")) return CATALOG;
    if (text.includes("pg_database_size")) return [{ bytes: BigInt(14_000_000) }];
    if (isFootprint(text)) {
      if (options.footprintFails) throw new Error("canceling statement due to statement timeout");
      return [
        { table: "Ticket", shopId: "s0", rows: BigInt(4), bytes: BigInt(16_000) },
        { table: "InvoiceLine", shopId: "s0", rows: BigInt(6), bytes: BigInt(4_000) },
        ...ids.map((id) => ({ table: "Shop", shopId: id, rows: BigInt(1), bytes: BigInt(500) })),
      ];
    }
    throw new Error(`unexpected raw query: ${text}`);
  };
  mocks.stat.mockResolvedValue({ size: 512 });
}

const paths = (list: readonly DbCall[]) => list.map((call) => call.path);

beforeEach(() => {
  vi.resetAllMocks();
  resetDb();
  // Every test starts long after the previous one's storage count, so none sees another's cache.
  clock += STORAGE_REFRESH_MS * 4;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  mocks.admin.mockResolvedValue({ id: "op1", name: "Ops", email: "ops@example.test" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("only an operator gets in", () => {
  it("checks the operator session before a single query, on every reader", async () => {
    platform(2);
    mocks.admin.mockRejectedValue(new Error("NEXT_REDIRECT /platform/login"));
    await expect(readPlatformOverview()).rejects.toThrow("NEXT_REDIRECT");
    await expect(readShopDirectory({})).rejects.toThrow("NEXT_REDIRECT");
    await expect(readShopDetail("s0")).rejects.toThrow("NEXT_REDIRECT");
    await expect(readActivityFeed({})).rejects.toThrow("NEXT_REDIRECT");
    await expect(recountStorage()).rejects.toThrow("NEXT_REDIRECT");
    expect(calls).toEqual([]);
  });
});

describe("the shop list", () => {
  it("costs the same fixed set of grouped queries for 3 shops or 60, never one per shop", async () => {
    platform(3);
    await readShopDirectory({});
    const small = paths(calls).sort();

    resetDb();
    clock += STORAGE_REFRESH_MS * 2;
    vi.setSystemTime(clock);
    platform(60);
    const { view } = await readShopDirectory({});
    expect(view.matching).toBe(60);
    expect(paths(calls).sort()).toEqual(small);
    expect(calls.length).toBeLessThan(20);
    for (const perShop of ["shop.findUnique", "ticket.count", "customer.count", "attachment.aggregate"]) {
      expect(callsTo(perShop)).toEqual([]);
    }
  });

  it("adds uploads, automatic photos, the logo and the database estimate into each shop's space", async () => {
    platform(3);
    const { view, storage } = await readShopDirectory({ sort: "storage" });
    const [first, ...rest] = view.rows;
    expect(first.id).toBe("s0");
    expect(first.uploads).toEqual({ count: 3, bytes: 4_000 });
    expect(first.logoBytes).toBe(512);
    expect(first.fileBytes).toBe(4_512);
    expect(first.database).toEqual({ rows: 11, bytes: 20_500 });
    expect(first.storageBytes).toBe(25_012);
    expect(rest.map((row) => row.storageBytes)).toEqual([500, 500]);
    expect(storage).toMatchObject({ estimateAvailable: true, databaseSizeBytes: 14_000_000 });
    expect(mocks.stat).toHaveBeenCalledWith(expect.stringMatching(/public[\\/]uploads[\\/]s0[\\/]a{32}\.png$/));
  });

  it("merges each shop's numbers: staff on and off, owner, money, last activity", async () => {
    platform(2);
    const { view } = await readShopDirectory({ sort: "name" });
    const s0 = view.rows.find((row) => row.id === "s0")!;
    expect(s0).toMatchObject({
      owner: { name: "Owner s0", email: "s0@shop.example" },
      staff: 3,
      activeStaff: 1,
      customers: 7,
      repairs: 4,
      invoices: 3,
      products: 9,
      payments: { count: 5, cents: 10_000 },
      status: "active",
    });
    expect(s0.lastActiveAt).toEqual(daysAgo(1));
    const s1 = view.rows.find((row) => row.id === "s1")!;
    // Its last payment was 90 days ago and it joined 101 days ago: quiet.
    expect(s1).toMatchObject({ staff: 1, customers: 0, repairs: 0, status: "quiet", lastActiveAt: daysAgo(90) });
  });

  it("does not count invoices a recurring schedule made as someone using the shop", async () => {
    platform(1);
    await readShopDirectory({});
    const invoiceGroups = callsTo("invoice.groupBy").map((call) => call.args);
    expect(invoiceGroups).toContainEqual(expect.objectContaining({ where: { recurringInvoiceId: null }, _max: { createdAt: true } }));
    expect(invoiceGroups.find((args) => args._count)).not.toHaveProperty("where");
  });

  it("never reads passwords, keys or secrets to build the list", async () => {
    platform(2);
    await readShopDirectory({});
    const selected = JSON.stringify(calls.map((call) => call.args.select ?? null));
    for (const secret of ["passwordHash", "totpSecret", "pinHash", "stripeWebhookSecret", "pushPrivateKey", "accessToken", "refreshToken"]) {
      expect(selected).not.toContain(secret);
    }
  });
});

describe("the storage count", () => {
  it("measures the slow numbers once per refresh, and Count again measures them now", async () => {
    platform(2);
    const footprints = () => callsTo("$queryRaw").filter((call) => isFootprint(String(call.args.sql))).length;
    await readShopDirectory({});
    await readShopDirectory({ sort: "storage" });
    await readPlatformOverview();
    expect(footprints()).toBe(1);
    expect(callsTo("$executeRaw")[0].args.sql).toContain("statement_timeout");

    await recountStorage();
    expect(footprints()).toBe(2);

    clock += STORAGE_REFRESH_MS + 1;
    vi.setSystemTime(clock);
    await readShopDirectory({});
    expect(footprints()).toBe(3);
  });

  it("keeps exact file sizes and says so when the database estimate fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    platform(2, { footprintFails: true });
    const { view, storage } = await readShopDirectory({ sort: "storage" });
    expect(storage.estimateAvailable).toBe(false);
    expect(view.rows[0]).toMatchObject({ id: "s0", database: null, fileBytes: 4_512, storageBytes: 4_512 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("database estimate unavailable"), expect.stringContaining("timeout"));
  });

  it("asks object storage for a logo's size when it is not on this server's disk", async () => {
    platform(1);
    handlers["shop.findMany"] = ((previous) => (args: Record<string, unknown>) =>
      args.where && "logoPath" in (args.where as object) ? [{ id: "s0", logoPath: "s0/abc.png", logoStorage: "s3" }] : previous(args))(
      handlers["shop.findMany"],
    );
    mocks.readUpload.mockResolvedValue({ body: Buffer.alloc(0), contentType: "image/png", sizeBytes: 2_048 });
    const { view } = await readShopDirectory({});
    expect(mocks.readUpload).toHaveBeenCalledWith("s3", "s0/abc.png");
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(view.rows[0].logoBytes).toBe(2_048);
  });
});

describe("the overview", () => {
  it("adds up the platform and keeps each currency's recent payments apart", async () => {
    platform(3);
    const overview = await readPlatformOverview();
    expect(overview.totals).toMatchObject({ shops: 3, repairs: 4, invoices: 3, staff: 5, activeStaff: 3 });
    expect(overview.totals.payments).toEqual([
      { currency: "USD", count: 5, cents: 10_000 },
      { currency: "CAD", count: 2, cents: 4_000 },
    ]);
    expect(overview.last30Days).toEqual({
      repairs: 2,
      invoices: 1,
      signedInStaff: 1,
      payments: [
        { currency: "CAD", count: 2, cents: 4_000 },
        { currency: "USD", count: 1, cents: 2_500 },
      ],
    });
    expect(overview.newFeedback).toBe(4);
    expect(overview.biggest.map((shop) => shop.id)).toEqual(["s0", "s1", "s2"]);
    expect(callsTo("productFeedback.count")[0].args).toEqual({ where: { status: "NEW" } });
  });
});

describe("one shop", () => {
  function shopHandlers() {
    platform(1);
    handlers["shop.findUnique"] = (args) =>
      (args.where as { id: string }).id === "s0"
        ? {
            id: "s0",
            name: "Shop 0",
            slug: "shop-0",
            createdAt: daysAgo(100),
            currency: "usd",
            timezone: "America/Edmonton",
            phone: null,
            email: null,
            city: "Calgary",
            state: "AB",
            country: "CA",
            logoPath: `/uploads/s0/${"a".repeat(32)}.png`,
            stripeOnboardedAt: null,
            deletionRequestedAt: null,
            deletionPurgeAfter: null,
          }
        : null;
    handlers["user.findMany"] = () => [
      { id: "u3", name: "Zed", email: "z@x", role: "TECH", active: true, lastLoginAt: daysAgo(2), createdAt: daysAgo(20), totpEnabledAt: null, googleLinkedAt: null },
      { id: "u2", name: "Old", email: "o@x", role: "OWNER", active: false, lastLoginAt: null, createdAt: daysAgo(99), totpEnabledAt: null, googleLinkedAt: null },
      { id: "u1", name: "Dana", email: "d@x", role: "OWNER", active: true, lastLoginAt: daysAgo(40), createdAt: daysAgo(100), totpEnabledAt: daysAgo(10), googleLinkedAt: null },
    ];
    handlers["customer.count"] = () => 7;
    handlers["product.count"] = () => 9;
    handlers["location.count"] = () => 2;
    handlers["apiKey.count"] = () => 1;
    handlers["integrationConnection.findMany"] = () => [{ provider: "quickbooks", status: "connected", lastSyncAt: null }];
    handlers["payment.aggregate"] = (args) =>
      args._max ? { _max: { createdAt: daysAgo(80) } } : { _count: { _all: 5 }, _sum: { amountCents: 10_000 } };
    handlers["refund.aggregate"] = () => ({ _count: { _all: 1 }, _sum: { amountCents: 500 } });
    handlers["attachment.aggregate"] = (args) => {
      const where = args.where as Record<string, unknown>;
      if (where.ticketId && (where.ticketId as { not?: unknown }).not === null) return { _count: { _all: 2 }, _sum: { sizeBytes: 2_000 } };
      if (where.customerId && (where.customerId as { not?: unknown }).not === null) return { _count: { _all: 1 }, _sum: { sizeBytes: 700 } };
      if (where.productId && (where.productId as { not?: unknown }).not === null) return { _count: { _all: 3 }, _sum: { sizeBytes: 300 } };
      return { _count: { _all: 0 }, _sum: { sizeBytes: null } };
    };
    handlers["automaticProductPhoto.aggregate"] = () => ({ _count: { _all: 1 }, _sum: { sizeBytes: 1_000 } });
    handlers["auditLog.findMany"] = () => [
      { id: "a1", action: "invoice.voided", summary: "Voided invoice #1006", createdAt: daysAgo(3), user: { name: "Dana" } },
    ];
    for (const model of ["customer", "ticket", "invoice", "auditLog"]) {
      handlers[`${model}.aggregate`] = () => ({ _max: { createdAt: model === "auditLog" ? daysAgo(3) : daysAgo(60) } });
    }
    const raw = handlers["$queryRaw"];
    handlers["$queryRaw"] = (args) => (String(args.sql).includes("intakeSignatureDataUrl") ? [{ bytes: BigInt(1_600) }] : raw(args));
  }

  it("refuses an odd id without asking the database, and says when a shop is gone", async () => {
    shopHandlers();
    expect((await readShopDetail("../../etc/passwd")).shop).toBeNull();
    expect(callsTo("shop.findUnique")).toEqual([]);
    expect((await readShopDetail("missing")).shop).toBeNull();
    expect(callsTo("shop.findUnique")).toHaveLength(1);
  });

  it("breaks space down by kind and adds it up with the database estimate", async () => {
    shopHandlers();
    const { shop } = await readShopDetail("s0");
    expect(shop!.storage.files).toEqual({
      repairs: { count: 2, bytes: 2_000 },
      customers: { count: 1, bytes: 700 },
      products: { count: 3, bytes: 300 },
      other: { count: 0, bytes: 0 },
      automaticPhotos: { count: 1, bytes: 1_000 },
      logoBytes: 512,
    });
    expect(shop!.storage.fileBytes).toBe(4_512);
    expect(shop!.storage.database).toMatchObject({ rows: 11, bytes: 20_500 });
    expect(shop!.storage.database!.tables[0]).toMatchObject({ table: "Ticket", label: "Repairs" });
    expect(shop!.storage.totalBytes).toBe(25_012);
    expect(shop!.storage.signatureBytes).toBe(1_600);
    const signatureQuery = callsTo("$queryRaw").find((call) => String(call.args.sql).includes("intakeSignatureDataUrl"))!;
    expect(signatureQuery.args.values).toEqual(["s0", "s0", "s0"]);
  });

  it("scopes every per-shop query to that shop", async () => {
    shopHandlers();
    await readShopDetail("s0");
    const scoped = calls.filter((call) => !["shop.findUnique", "$queryRaw", "$executeRaw", "$transaction", "shop.findMany"].includes(call.path));
    expect(scoped.length).toBeGreaterThan(15);
    for (const call of scoped) {
      expect((call.args.where as Record<string, unknown> | undefined)?.shopId, call.path).toBe("s0");
    }
  });

  it("lists staff who can sign in first, owner first, and works out the owner and last activity", async () => {
    shopHandlers();
    const { shop } = await readShopDetail("s0");
    expect(shop!.staff.map((person) => person.name)).toEqual(["Dana", "Zed", "Old"]);
    expect(shop!.owner?.name).toBe("Dana");
    expect(shop!.lastActiveAt).toEqual(daysAgo(2));
    expect(shop!.status).toBe("active");
    expect(shop!.usage).toMatchObject({
      customers: 7,
      repairs: 2,
      repairs30: 2,
      payments: { count: 5, cents: 10_000 },
      refunds: { count: 1, cents: 500 },
      locations: 2,
      apiKeys: 1,
    });
    expect(shop!.activity).toEqual([
      expect.objectContaining({ kind: "important", title: "Voided invoice #1006", actor: "Dana", shop: { id: "s0", name: "Shop 0" } }),
    ]);
    expect(callsTo("invoice.aggregate")[0].args.where).toEqual({ shopId: "s0", recurringInvoiceId: null });
  });

  it("never selects a login's password, PIN, two-step secret or an integration's tokens", async () => {
    shopHandlers();
    await readShopDetail("s0");
    const userSelect = Object.keys(callsTo("user.findMany")[0].args.select as object);
    for (const secret of ["passwordHash", "pinHash", "totpSecret", "totpRecoveryCodes"]) expect(userSelect).not.toContain(secret);
    expect(Object.keys(callsTo("integrationConnection.findMany")[0].args.select as object)).toEqual(["provider", "status", "lastSyncAt"]);
    const shopSelect = Object.keys(callsTo("shop.findUnique")[0].args.select as object);
    for (const secret of ["stripeWebhookSecret", "pushPrivateKey", "settings"]) expect(shopSelect).not.toContain(secret);
  });
});

describe("the activity feed", () => {
  it("reads only the audit log for sign-ins, only after the cursor, newest first", async () => {
    platform(1);
    const cursor = `${daysAgo(3).getTime()}.audit.ckcursor1`;
    const feed = await readActivityFeed({ show: "signin", before: cursor });
    expect(feed.filter).toBe("signin");
    expect(feed.isFirstPage).toBe(false);
    expect(paths(calls)).toEqual(["auditLog.findMany"]);
    const args = callsTo("auditLog.findMany")[0].args;
    expect(args.where).toEqual({
      action: { in: ["user.login", "user.staff_switch"] },
      OR: [{ createdAt: { lt: daysAgo(3) } }, { createdAt: daysAgo(3), id: { lt: "ckcursor1" } }],
    });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(51);
  });

  it("merges new shops, feedback and audit events for Everything, ignoring a forged cursor", async () => {
    platform(1);
    handlers["shop.findMany"] = () => [
      { id: "s9", name: "Newest", createdAt: daysAgo(1), users: [{ name: "Ann", email: "ann@x.example" }] },
    ];
    handlers["productFeedback.findMany"] = () => [{ id: "f1", kind: "BUG", title: "Till froze", createdAt: daysAgo(2) }];
    handlers["auditLog.findMany"] = () => [
      { id: "a1", action: "user.login", summary: "Signed in", createdAt: daysAgo(3), shop: { id: "s0", name: "Shop 0" }, user: { name: "Dana" } },
    ];
    const feed = await readActivityFeed({ before: "1234.audit.x;DROP" });
    expect(feed.isFirstPage).toBe(true);
    expect(feed.items.map((item) => item.title)).toEqual(["New shop signed up: Newest", "Bug report: Till froze", "Signed in"]);
    expect(feed.next).toBeNull();
    // A cursor that does not parse starts from the newest: no source gets a date condition.
    for (const call of calls) expect(call.args.where ?? {}).toEqual({});
  });
});
