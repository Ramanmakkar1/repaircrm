import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { calls, callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const removeUpload = vi.fn(async () => undefined);
vi.mock("@/lib/storage", () => ({ removeUpload }));

const rm = vi.fn(async () => undefined);
vi.mock("node:fs/promises", () => ({ rm, default: { rm } }));

vi.mock("@/lib/auth", () => ({
  unusablePasswordHash: vi.fn(async () => "$2b$10$unusable"),
  verifyPassword: vi.fn(async () => true),
}));

const emails = {
  sendLoginDeletedEmail: vi.fn(async () => undefined),
  sendShopDeletionRequestedEmail: vi.fn(async () => undefined),
  sendShopDeletionCancelledEmail: vi.fn(async () => undefined),
  sendShopDeletedEmail: vi.fn(async () => undefined),
};
vi.mock("@/lib/account-deletion/email", () => emails);

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret";

const { purgeShop, runDueShopDeletions } = await import("@/lib/account-deletion/purge");
const { anonymiseUser, loginDeletionBlock } = await import("@/lib/account-deletion/user");
const { requestShopDeletion, cancelShopDeletion } = await import("@/lib/account-deletion/shop");
const { graceHours, purgeAfterFrom, shopNameMatches } = await import("@/lib/account-deletion/config");

const SHOP = "cmshopaaaaaaaaaaaaaaaaaa";
const OTHER_SHOP = "cmshopbbbbbbbbbbbbbbbbbb";
const NOW = new Date("2026-11-04T12:00:00.000Z");

/** Every model in the schema, and the ones that carry a shopId column. */
const schema = readFileSync(fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)), "utf8");
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({
  name: m[1],
  delegate: m[1][0].toLowerCase() + m[1].slice(1),
  hasShopId: /^\s+shopId\s+String/m.test(m[2]),
}));

function registerAllDeletes(count = 2) {
  for (const model of models) handlers[`${model.delegate}.deleteMany`] = () => ({ count });
}

/** True when some value anywhere in the object is `undefined` (Prisma would drop that filter). */
function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasUndefined);
}

/** True when the shop id appears somewhere in the where clause (directly or through a parent). */
function mentions(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((v) => mentions(v, id));
}

function dueShop(over: Record<string, unknown> = {}) {
  return {
    id: SHOP,
    name: "Fixit Phones",
    email: "shop@example.com",
    logoPath: `/uploads/${SHOP}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png`,
    logoStorage: "local",
    deletionRequestedById: "user_owner",
    ...over,
  };
}

beforeEach(() => {
  resetDb();
  removeUpload.mockClear();
  rm.mockClear();
  for (const fn of Object.values(emails)) fn.mockClear();
  delete process.env.ACCOUNT_DELETION_GRACE_HOURS;
});

describe("purgeShop — every delete is scoped to the one shop", () => {
  function stubDue() {
    handlers["shop.findFirst"] = () => dueShop();
    handlers["user.findFirst"] = () => ({ name: "Owner", email: "owner@example.com" });
    handlers["attachment.findMany"] = () => [
      { storage: "s3", path: `${SHOP}/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg` },
    ];
    handlers["automaticProductPhoto.findMany"] = () => [
      { storage: "local", path: `/uploads/${SHOP}/cccccccccccccccccccccccccccccccc.webp` },
    ];
    registerAllDeletes();
  }

  it("deletes every tenant table, each with the shopId and never an undefined filter", async () => {
    stubDue();
    await expect(purgeShop(SHOP, NOW)).resolves.toBe(true);

    const deletes = calls.filter((c) => c.path.endsWith(".deleteMany"));
    expect(deletes.length).toBeGreaterThan(40);
    for (const call of deletes) {
      const where = call.args.where;
      expect(where, call.path).toBeTruthy();
      expect(hasUndefined(where), `${call.path} has an undefined filter`).toBe(false);
      expect(mentions(where, SHOP), `${call.path} is not scoped to the shop`).toBe(true);
      expect(mentions(where, OTHER_SHOP)).toBe(false);
    }

    // Every model that carries a shopId is purged explicitly (a new table
    // fails this until purge.ts learns about it).
    for (const model of models.filter((m) => m.hasShopId)) {
      expect(callsTo(`${model.delegate}.deleteMany`).length, `${model.name} not purged`).toBe(1);
    }
    // The child tables without a shopId are reached through their parent.
    for (const child of ["contact", "portalToken", "invoiceLine", "estimateLine", "recurringInvoiceLine", "purchaseOrderLine", "passwordResetToken", "emailAuthCode"]) {
      expect(callsTo(`${child}.deleteMany`).length, `${child} not purged`).toBe(1);
    }
    expect(callsTo("productFeedback.deleteMany")[0].args.where).toEqual({ reporterShopId: SHOP });
    // The tenant root is last.
    expect(deletes.at(-1)?.path).toBe("shop.deleteMany");
    expect(deletes.at(-1)?.args.where).toEqual({ id: SHOP });
    // PurchaseOrder -> Vendor is RESTRICT, so orders must go first.
    const order = deletes.map((c) => c.path);
    expect(order.indexOf("purchaseOrder.deleteMany")).toBeLessThan(order.indexOf("vendor.deleteMany"));
  });

  it("removes the files through the storage drivers and the local folder, before the rows", async () => {
    stubDue();
    await purgeShop(SHOP, NOW);
    expect(removeUpload).toHaveBeenCalledTimes(3);
    expect(rm).toHaveBeenCalledTimes(1);
    expect(String((rm.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`public/uploads/${SHOP}$`));
    expect(emails.sendShopDeletedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.com" }));
  });

  it("refuses an undefined, empty or malformed shop id before issuing any query", async () => {
    for (const bad of [undefined, "", "   ", "../etc", null, 42]) {
      resetDb();
      await expect(purgeShop(bad as unknown as string, NOW)).rejects.toThrow(/refused/);
      expect(calls).toHaveLength(0);
    }
  });

  it("does nothing for a shop that is not due (or already gone): re-running is safe", async () => {
    handlers["shop.findFirst"] = () => null;
    registerAllDeletes();
    await expect(purgeShop(SHOP, NOW)).resolves.toBe(false);
    expect(calls.filter((c) => c.path.endsWith(".deleteMany"))).toHaveLength(0);
    expect(removeUpload).not.toHaveBeenCalled();
  });

  it("a cancel that lands before the transaction wins: nothing is deleted", async () => {
    stubDue();
    let reads = 0;
    handlers["shop.findFirst"] = () => (++reads === 1 ? dueShop() : null);
    await expect(purgeShop(SHOP, NOW)).resolves.toBe(false);
    expect(calls.filter((c) => c.path.endsWith(".deleteMany"))).toHaveLength(0);
    // The due check itself is scoped and time-bounded.
    const where = callsTo("shop.findFirst")[1].args.where as Record<string, unknown>;
    expect(where).toMatchObject({ id: SHOP, deletionRequestedAt: { not: null }, deletionPurgeAfter: { lte: NOW } });
  });
});

describe("runDueShopDeletions", () => {
  it("purges each due shop and counts a failure without stopping the others", async () => {
    handlers["shop.findMany"] = () => [{ id: "bad" }, { id: SHOP }];
    handlers["shop.findFirst"] = () => dueShop();
    handlers["user.findFirst"] = () => null;
    handlers["attachment.findMany"] = () => [];
    handlers["automaticProductPhoto.findMany"] = () => [];
    registerAllDeletes();
    const summary = await runDueShopDeletions(NOW);
    expect(summary).toMatchObject({ purged: 1, failed: 1 });
    expect(callsTo("shop.findMany")[0].args.where).toEqual({
      deletionRequestedAt: { not: null },
      deletionPurgeAfter: { lte: NOW },
    });
  });
});

describe("deleting your own login", () => {
  it("anonymises the row and removes what authenticates the person", async () => {
    handlers["user.findFirst"] = () => ({ name: "Sam Tech", email: "sam@example.com", role: "TECH", shop: { name: "Fixit" } });
    handlers["user.updateMany"] = () => ({ count: 1 });
    for (const path of ["pushSubscription", "nativePushDevice", "savedView", "scanSession", "passwordResetToken", "emailAuthCode"]) {
      handlers[`${path}.deleteMany`] = () => ({ count: 1 });
    }
    handlers["productFeedback.updateMany"] = () => ({ count: 0 });
    handlers["auditLog.create"] = () => ({});
    handlers["$executeRaw"] = () => 3;

    await expect(anonymiseUser({ userId: "user_tech", shopId: SHOP })).resolves.toBe(true);

    const update = callsTo("user.updateMany")[0].args;
    expect(update.where).toEqual({ id: "user_tech", shopId: SHOP });
    expect(update.data).toMatchObject({
      name: "Deleted user",
      email: "deleted+user_tech@deleted.invalid",
      active: false,
      role: "TECH",
      hasPassword: false,
      totpSecret: null,
      totpEnabledAt: null,
      totpRecoveryCodes: [],
      pinHash: null,
      googleSub: null,
      googleEmail: null,
      avatarUrl: null,
    });
    expect(update.data).not.toHaveProperty("passwordHash", undefined);
    // Never a hard delete: that would cascade time entries, clock-ins and drawers.
    expect(callsTo("user.delete")).toHaveLength(0);
    expect(callsTo("user.deleteMany")).toHaveLength(0);
    for (const call of calls.filter((c) => c.path.endsWith(".deleteMany"))) {
      expect(hasUndefined(call.args.where)).toBe(false);
      expect(mentions(call.args.where, "user_tech")).toBe(true);
    }
    const auditRow = callsTo("auditLog.create")[0].args.data as Record<string, unknown>;
    expect(String(auditRow.summary)).not.toContain("Sam");
    // Older audit rows about this login lose the name and email, in this shop only.
    const scrub = callsTo("$executeRaw")[0].args as { sql: string; values: unknown[] };
    expect(scrub.sql).toContain('UPDATE "AuditLog"');
    expect(scrub.sql).toMatch(/"shopId" = \? AND entity = 'user' AND "entityId" = \?/);
    expect(scrub.values.slice(-2)).toEqual([SHOP, "user_tech"]);
    expect(scrub.values).toEqual(expect.arrayContaining(["sam@example.com", "Deleted user"]));
    expect(scrub.values.some((value) => typeof value === "string" && value.startsWith("Sam"))).toBe(true);
    expect(emails.sendLoginDeletedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sam@example.com" }));
  });

  it("blocks the last owner, not an owner with a co-owner, and never a technician", async () => {
    handlers["shop.findUnique"] = () => ({ deletionRequestedAt: null });
    handlers["user.count"] = () => 0;
    await expect(loginDeletionBlock({ userId: "u1", shopId: SHOP, role: "OWNER" })).resolves.toEqual({ blocked: true, reason: "last-owner" });
    expect(callsTo("user.count")[0].args.where).toEqual({ shopId: SHOP, role: "OWNER", active: true, NOT: { id: "u1" } });

    handlers["user.count"] = () => 1;
    await expect(loginDeletionBlock({ userId: "u1", shopId: SHOP, role: "OWNER" })).resolves.toEqual({ blocked: false });
    await expect(loginDeletionBlock({ userId: "u2", shopId: SHOP, role: "TECH" })).resolves.toEqual({ blocked: false });
  });
});

describe("scheduling and cancelling a shop deletion", () => {
  it("suspends exactly the active logins and keys of this shop and stamps the date", async () => {
    process.env.ACCOUNT_DELETION_GRACE_HOURS = "168";
    handlers["shop.findUnique"] = () => ({ name: "Fixit", timezone: "America/Edmonton", deletionRequestedAt: null });
    handlers["user.findMany"] = () => [{ id: "u1" }, { id: "u2" }];
    handlers["apiKey.findMany"] = () => [{ id: "k1" }];
    handlers["shop.update"] = () => ({});
    handlers["user.updateMany"] = () => ({ count: 2 });
    handlers["apiKey.updateMany"] = () => ({ count: 1 });
    handlers["auditLog.create"] = () => ({});
    handlers["user.findFirst"] = () => ({ name: "Owner", email: "owner@example.com" });

    const result = await requestShopDeletion({ shopId: SHOP, userId: "u1", now: NOW });
    expect(result.ok).toBe(true);

    expect(callsTo("user.findMany")[0].args.where).toEqual({ shopId: SHOP, active: true });
    expect(callsTo("user.updateMany")[0].args).toEqual({ where: { shopId: SHOP, id: { in: ["u1", "u2"] } }, data: { active: false } });
    expect(callsTo("apiKey.updateMany")[0].args).toEqual({ where: { shopId: SHOP, id: { in: ["k1"] } }, data: { active: false } });
    expect(callsTo("shop.update")[0].args.data).toMatchObject({
      deletionRequestedAt: NOW,
      deletionPurgeAfter: new Date("2026-11-11T12:00:00.000Z"),
      deletionSuspendedUserIds: ["u1", "u2"],
      deletionSuspendedApiKeyIds: ["k1"],
    });
    expect(emails.sendShopDeletionRequestedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@example.com", cancelUrl: expect.stringContaining("/delete-account?keep=") }),
    );
  });

  it("refuses a second request while one is pending", async () => {
    handlers["shop.findUnique"] = () => ({ name: "Fixit", timezone: "UTC", deletionRequestedAt: NOW });
    const result = await requestShopDeletion({ shopId: SHOP, userId: "u1", now: NOW });
    expect(result).toEqual({ ok: false, error: "This shop is already scheduled for deletion." });
    expect(callsTo("user.updateMany")).toHaveLength(0);
  });

  it("cancel switches back on only the suspended logins and keys", async () => {
    handlers["shop.findUnique"] = () => ({
      name: "Fixit",
      deletionRequestedAt: NOW,
      deletionPurgeAfter: new Date(NOW.getTime() + 86_400_000),
      deletionRequestedById: "u1",
      deletionSuspendedUserIds: ["u1"],
      deletionSuspendedApiKeyIds: [],
    });
    handlers["shop.updateMany"] = () => ({ count: 1 });
    handlers["user.updateMany"] = () => ({ count: 1 });
    handlers["auditLog.create"] = () => ({});
    handlers["user.findFirst"] = () => ({ name: "Owner", email: "owner@example.com" });

    await expect(cancelShopDeletion({ shopId: SHOP, actorUserId: "u1", via: "password", now: NOW })).resolves.toEqual({ ok: true, shopName: "Fixit" });
    expect(callsTo("shop.updateMany")[0].args.where).toEqual({ id: SHOP, deletionRequestedAt: NOW });
    expect(callsTo("user.updateMany")[0].args).toEqual({ where: { shopId: SHOP, id: { in: ["u1"] } }, data: { active: true } });
    expect(callsTo("apiKey.updateMany")).toHaveLength(0);
  });

  it("cancel is refused once the grace period is over", async () => {
    handlers["shop.findUnique"] = () => ({
      name: "Fixit",
      deletionRequestedAt: NOW,
      deletionPurgeAfter: NOW,
      deletionRequestedById: "u1",
      deletionSuspendedUserIds: ["u1"],
      deletionSuspendedApiKeyIds: [],
    });
    const result = await cancelShopDeletion({ shopId: SHOP, actorUserId: "u1", via: "password", now: NOW });
    expect(result.ok).toBe(false);
    expect(callsTo("shop.updateMany")).toHaveLength(0);
  });
});

describe("config", () => {
  it("reads the grace period from the env at request time, defaulting to seven days", () => {
    expect(graceHours()).toBe(168);
    process.env.ACCOUNT_DELETION_GRACE_HOURS = "0";
    expect(graceHours()).toBe(0);
    expect(purgeAfterFrom(NOW).getTime()).toBe(NOW.getTime());
    process.env.ACCOUNT_DELETION_GRACE_HOURS = "nonsense";
    expect(graceHours()).toBe(168);
  });

  it("matches the typed shop name ignoring case and extra spaces, never an empty one", () => {
    expect(shopNameMatches("  fixit   PHONES ", "Fixit Phones")).toBe(true);
    expect(shopNameMatches("Fixit", "Fixit Phones")).toBe(false);
    expect(shopNameMatches("", "")).toBe(false);
  });
});
