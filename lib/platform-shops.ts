import "server-only";

import { stat } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  ACTIVITY_PAGE_SIZE,
  activityPlan,
  afterCursorWhere,
  auditToActivity,
  decodeCursor,
  feedbackToActivity,
  mergeActivity,
  parseActivityFilter,
  signupToActivity,
  type ActivityCursor,
  type ActivityFilter,
} from "@/lib/platform-activity";
import {
  applyDirectoryQuery,
  latestDate,
  parseDirectoryQuery,
  shopStatus,
  summarizeShops,
  toShopRow,
  type ShopFacts,
  type ShopRow,
} from "@/lib/platform-directory";
import {
  footprintQuery,
  footprintSources,
  groupFootprint,
  type FootprintRow,
  type ShopFootprint,
} from "@/lib/platform-footprint";
import { readUpload } from "@/lib/storage";

/**
 * The operator console's view of every shop: who they are, how much they use
 * it, and how much space they take.
 *
 * Same rule as lib/platform-console-data.ts: every exported reader calls
 * requirePlatformAdmin() before its first cross-shop query, and the unguarded
 * helpers below are not exported, so no other route can borrow them.
 *
 * Query budget. The shop list is a fixed set of grouped queries (one per
 * table, `GROUP BY "shopId"`), never one query per shop. The one expensive
 * number — the database estimate, which reads every row — is measured at most
 * once per STORAGE_REFRESH_MS and kept in memory (the app is one long-lived
 * Node process), with a "Count again" button for a fresh figure.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const STORAGE_REFRESH_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Storage snapshot (cached)
// ---------------------------------------------------------------------------

type StorageSnapshot = {
  countedAt: Date;
  /** Estimated database records per shop; null when the estimate could not be made. */
  database: Map<string, ShopFootprint> | null;
  /** Logo file size per shop that has one; null when that file could not be measured. */
  logos: Map<string, number | null>;
  /** The whole PostgreSQL database, indexes included. */
  databaseSizeBytes: number | null;
};

let snapshot: StorageSnapshot | null = null;
let inflight: Promise<StorageSnapshot> | null = null;

async function measureDatabase(): Promise<Map<string, ShopFootprint> | null> {
  try {
    const columns = await db.$queryRaw<Array<{ table: string; column: string }>>`
      SELECT table_name::text AS "table", column_name::text AS "column"
      FROM information_schema.columns
      WHERE table_schema = current_schema()`;
    const query = footprintQuery(footprintSources(columns));
    if (!query) return new Map();
    // It reads every row once, so it gets a deadline (30 s) rather than holding a connection indefinitely.
    const [, rows] = await db.$transaction([
      db.$executeRaw`SET LOCAL statement_timeout = 30000`,
      db.$queryRaw<FootprintRow[]>(query),
    ]);
    return groupFootprint(rows);
  } catch (error) {
    console.warn("[platform] database estimate unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function measureDatabaseSize(): Promise<number | null> {
  try {
    const rows = await db.$queryRaw<Array<{ bytes: bigint | number }>>`
      SELECT pg_database_size(current_database())::bigint AS "bytes"`;
    return rows[0] ? Number(rows[0].bytes) : null;
  } catch {
    return null;
  }
}

/** The same shape lib/storage/local.ts writes; anything else is not measured. */
const LOCAL_UPLOAD = /^\/uploads\/([A-Za-z0-9_-]{1,64})\/([a-f0-9]{32}\.[a-z0-9]{1,8})$/;

async function logoSize(storage: string | null, stored: string): Promise<number | null> {
  if ((storage ?? "local") === "local") {
    const match = LOCAL_UPLOAD.exec(stored);
    if (!match) return null;
    try {
      return (await stat(path.join(process.cwd(), "public", "uploads", match[1], match[2]))).size;
    } catch {
      return null;
    }
  }
  // Object storage has no size column for logos, so read it back (at most once per refresh).
  const object = await readUpload(storage ?? "local", stored);
  return object ? object.sizeBytes : null;
}

async function measureLogos(): Promise<Map<string, number | null>> {
  const sizes = new Map<string, number | null>();
  try {
    const shops = await db.shop.findMany({
      where: { logoPath: { not: null } },
      select: { id: true, logoPath: true, logoStorage: true },
    });
    for (let start = 0; start < shops.length; start += 8) {
      await Promise.all(
        shops.slice(start, start + 8).map(async (shop) => {
          sizes.set(shop.id, shop.logoPath ? await logoSize(shop.logoStorage, shop.logoPath) : null);
        }),
      );
    }
  } catch (error) {
    console.warn("[platform] logo sizes unavailable:", error instanceof Error ? error.message : error);
  }
  return sizes;
}

function storageSnapshot(refresh = false): Promise<StorageSnapshot> {
  if (!refresh && snapshot && Date.now() - snapshot.countedAt.getTime() < STORAGE_REFRESH_MS) {
    return Promise.resolve(snapshot);
  }
  // Two people opening the console at once share one count.
  inflight ??= Promise.all([measureDatabase(), measureLogos(), measureDatabaseSize()])
    .then(([database, logos, databaseSizeBytes]) => {
      snapshot = { countedAt: new Date(), database, logos, databaseSizeBytes };
      return snapshot;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export type StorageStatus = {
  countedAt: Date;
  databaseSizeBytes: number | null;
  /** False when the per-shop database estimate failed; file sizes are still exact. */
  estimateAvailable: boolean;
};

function storageStatus(storage: StorageSnapshot): StorageStatus {
  return {
    countedAt: storage.countedAt,
    databaseSizeBytes: storage.databaseSizeBytes,
    estimateAvailable: storage.database !== null,
  };
}

// ---------------------------------------------------------------------------
// One row per shop
// ---------------------------------------------------------------------------

function byShop<T extends { shopId: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.shopId, row]));
}

async function loadShopRows(now: Date): Promise<{ rows: ShopRow[]; storage: StorageSnapshot }> {
  const [
    shops,
    owners,
    users,
    customers,
    tickets,
    invoices,
    madeInvoices,
    products,
    payments,
    audits,
    attachments,
    photos,
    storage,
  ] = await Promise.all([
    db.shop.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        currency: true,
        city: true,
        country: true,
        deletionRequestedAt: true,
        deletionPurgeAfter: true,
      },
    }),
    db.user.findMany({
      where: { role: "OWNER" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { shopId: true, name: true, email: true },
    }),
    db.user.groupBy({ by: ["shopId", "active"], _count: { _all: true }, _max: { lastLoginAt: true } }),
    db.customer.groupBy({ by: ["shopId"], _count: { _all: true }, _max: { createdAt: true } }),
    db.ticket.groupBy({ by: ["shopId"], _count: { _all: true }, _max: { createdAt: true } }),
    db.invoice.groupBy({ by: ["shopId"], _count: { _all: true } }),
    // A recurring schedule makes invoices with nobody at the shop, so only hand-made ones count as activity.
    db.invoice.groupBy({ by: ["shopId"], where: { recurringInvoiceId: null }, _max: { createdAt: true } }),
    db.product.groupBy({ by: ["shopId"], _count: { _all: true } }),
    db.payment.groupBy({
      by: ["shopId"],
      _count: { _all: true },
      _sum: { amountCents: true },
      _max: { createdAt: true },
    }),
    db.auditLog.groupBy({ by: ["shopId"], _max: { createdAt: true } }),
    db.attachment.groupBy({ by: ["shopId"], _count: { _all: true }, _sum: { sizeBytes: true } }),
    db.automaticProductPhoto.groupBy({
      by: ["shopId"],
      where: { path: { not: null } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    storageSnapshot(),
  ]);

  const ownerOf = new Map<string, { name: string; email: string }>();
  for (const owner of owners) {
    if (!ownerOf.has(owner.shopId)) ownerOf.set(owner.shopId, { name: owner.name, email: owner.email });
  }
  const staffOf = new Map<string, { staff: number; active: number; lastLogin: Date | null }>();
  for (const group of users) {
    const entry = staffOf.get(group.shopId) ?? { staff: 0, active: 0, lastLogin: null };
    entry.staff += group._count._all;
    if (group.active) entry.active += group._count._all;
    entry.lastLogin = latestDate(entry.lastLogin, group._max.lastLoginAt);
    staffOf.set(group.shopId, entry);
  }
  const customerOf = byShop(customers);
  const ticketOf = byShop(tickets);
  const invoiceOf = byShop(invoices);
  const madeInvoiceOf = byShop(madeInvoices);
  const productOf = byShop(products);
  const paymentOf = byShop(payments);
  const auditOf = byShop(audits);
  const attachmentOf = byShop(attachments);
  const photoOf = byShop(photos);

  const rows = shops.map((shop) => {
    const staff = staffOf.get(shop.id);
    const payment = paymentOf.get(shop.id);
    const attachment = attachmentOf.get(shop.id);
    const photo = photoOf.get(shop.id);
    const footprint = storage.database?.get(shop.id);
    const facts: ShopFacts = {
      ...shop,
      owner: ownerOf.get(shop.id) ?? null,
      staff: staff?.staff ?? 0,
      activeStaff: staff?.active ?? 0,
      customers: customerOf.get(shop.id)?._count._all ?? 0,
      repairs: ticketOf.get(shop.id)?._count._all ?? 0,
      invoices: invoiceOf.get(shop.id)?._count._all ?? 0,
      products: productOf.get(shop.id)?._count._all ?? 0,
      payments: { count: payment?._count._all ?? 0, cents: payment?._sum.amountCents ?? 0 },
      uploads: {
        count: (attachment?._count._all ?? 0) + (photo?._count._all ?? 0),
        bytes: (attachment?._sum.sizeBytes ?? 0) + (photo?._sum.sizeBytes ?? 0),
      },
      logoBytes: storage.logos.get(shop.id) ?? null,
      database: storage.database ? { rows: footprint?.rows ?? 0, bytes: footprint?.bytes ?? 0 } : null,
      activity: [
        staff?.lastLogin ?? null,
        customerOf.get(shop.id)?._max.createdAt ?? null,
        ticketOf.get(shop.id)?._max.createdAt ?? null,
        madeInvoiceOf.get(shop.id)?._max.createdAt ?? null,
        payment?._max.createdAt ?? null,
        auditOf.get(shop.id)?._max.createdAt ?? null,
      ],
    };
    return toShopRow(facts, now);
  });
  return { rows, storage };
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

async function loadActivity(filter: ActivityFilter, cursor: ActivityCursor | null, limit: number) {
  const plan = activityPlan(filter);
  const take = limit + 1;
  const [shops, feedback, audit] = await Promise.all([
    plan.shops
      ? db.shop.findMany({
          where: afterCursorWhere("shop", cursor),
          orderBy: NEWEST_FIRST,
          take,
          select: {
            id: true,
            name: true,
            createdAt: true,
            users: {
              where: { role: "OWNER" },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 1,
              select: { name: true, email: true },
            },
          },
        })
      : [],
    plan.feedback
      ? db.productFeedback.findMany({
          where: afterCursorWhere("feedback", cursor),
          orderBy: NEWEST_FIRST,
          take,
          select: { id: true, kind: true, title: true, createdAt: true },
        })
      : [],
    plan.audit === false
      ? []
      : db.auditLog.findMany({
          where: {
            ...(plan.audit ? { action: { in: [...plan.audit] } } : {}),
            ...afterCursorWhere("audit", cursor),
          },
          orderBy: NEWEST_FIRST,
          take,
          select: {
            id: true,
            action: true,
            summary: true,
            createdAt: true,
            shop: { select: { id: true, name: true } },
            user: { select: { name: true } },
          },
        }),
  ]);
  return mergeActivity(
    [
      shops.map((shop) => signupToActivity({ ...shop, owner: shop.users[0] ?? null })),
      feedback.map(feedbackToActivity),
      audit.map(auditToActivity),
    ],
    limit,
  );
}

// ---------------------------------------------------------------------------
// Exported, guarded readers
// ---------------------------------------------------------------------------

export async function readPlatformOverview() {
  const admin = await requirePlatformAdmin();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [{ rows, storage }, repairs30, invoices30, payments30, signedIn30, newFeedback, recent] = await Promise.all([
    loadShopRows(now),
    db.ticket.count({ where: { createdAt: { gte: since } } }),
    db.invoice.count({ where: { createdAt: { gte: since } } }),
    db.payment.groupBy({
      by: ["shopId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    db.user.count({ where: { active: true, lastLoginAt: { gte: since } } }),
    db.productFeedback.count({ where: { status: "NEW" } }),
    loadActivity("all", null, 8),
  ]);

  const currencyOf = new Map(rows.map((row) => [row.id, row.currency.toUpperCase()]));
  const recentPayments = new Map<string, { currency: string; count: number; cents: number }>();
  for (const group of payments30) {
    const currency = currencyOf.get(group.shopId) ?? "USD";
    const entry = recentPayments.get(currency) ?? { currency, count: 0, cents: 0 };
    entry.count += group._count._all;
    entry.cents += group._sum.amountCents ?? 0;
    recentPayments.set(currency, entry);
  }

  return {
    admin,
    now,
    totals: summarizeShops(rows, now),
    last30Days: {
      repairs: repairs30,
      invoices: invoices30,
      signedInStaff: signedIn30,
      payments: [...recentPayments.values()].sort((a, b) => b.cents - a.cents),
    },
    newFeedback,
    biggest: [...rows].sort((a, b) => b.storageBytes - a.storageBytes || a.name.localeCompare(b.name)).slice(0, 5),
    recent: recent.items,
    storage: storageStatus(storage),
  };
}

export async function readShopDirectory(params: Record<string, string | string[] | undefined>) {
  const admin = await requirePlatformAdmin();
  const now = new Date();
  const { rows, storage } = await loadShopRows(now);
  const query = parseDirectoryQuery(params);
  return {
    admin,
    now,
    query,
    totalShops: rows.length,
    view: applyDirectoryQuery(rows, query),
    storage: storageStatus(storage),
  };
}

export async function readActivityFeed(params: Record<string, string | string[] | undefined>) {
  const admin = await requirePlatformAdmin();
  const filter = parseActivityFilter(params.show);
  const cursor = decodeCursor(params.before);
  const page = await loadActivity(filter, cursor, ACTIVITY_PAGE_SIZE);
  return { admin, now: new Date(), filter, isFirstPage: cursor === null, ...page };
}

/** Repairs and tickets keep signatures as images inside the database; this is their share. */
async function signatureBytes(shopId: string): Promise<number | null> {
  try {
    const rows = await db.$queryRaw<Array<{ bytes: bigint | number | null }>>`
      SELECT (
        (SELECT coalesce(sum(pg_column_size("intakeSignatureDataUrl")), 0) FROM "Ticket" WHERE "shopId" = ${shopId})
        + (SELECT coalesce(sum(pg_column_size("signatureDataUrl")), 0) FROM "Invoice" WHERE "shopId" = ${shopId})
        + (SELECT coalesce(sum(pg_column_size("approvalSignatureDataUrl")), 0) FROM "Estimate" WHERE "shopId" = ${shopId})
      )::bigint AS "bytes"`;
    return rows[0] ? Number(rows[0].bytes ?? 0) : null;
  } catch {
    return null;
  }
}

function fileTotal(row: { _count: { _all: number }; _sum: { sizeBytes: number | null } }) {
  return { count: row._count._all, bytes: row._sum.sizeBytes ?? 0 };
}

const ROLE_ORDER: Record<string, number> = { OWNER: 0, FRONT_DESK: 1, TECH: 2 };

/** Everything the shop page shows, or `shop: null` for an unknown id. */
export async function readShopDetail(id: string) {
  const admin = await requirePlatformAdmin();
  const now = new Date();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { admin, now, shop: null };

  const shop = await db.shop.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      currency: true,
      timezone: true,
      phone: true,
      email: true,
      city: true,
      state: true,
      country: true,
      logoPath: true,
      stripeOnboardedAt: true,
      deletionRequestedAt: true,
      deletionPurgeAfter: true,
    },
  });
  if (!shop) return { admin, now, shop: null };

  const since = new Date(now.getTime() - 30 * DAY_MS);
  const where = { shopId: id };
  const [
    staff,
    customers,
    repairs,
    repairs30,
    invoices,
    invoices30,
    products,
    payments,
    payments30,
    refunds,
    repairFiles,
    customerFiles,
    productFiles,
    otherFiles,
    automaticPhotos,
    signatures,
    audit,
    locations,
    apiKeys,
    integrations,
    lastActivity,
    storage,
  ] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        totpEnabledAt: true,
        googleLinkedAt: true,
      },
    }),
    db.customer.count({ where }),
    db.ticket.count({ where }),
    db.ticket.count({ where: { ...where, createdAt: { gte: since } } }),
    db.invoice.count({ where }),
    db.invoice.count({ where: { ...where, createdAt: { gte: since } } }),
    db.product.count({ where }),
    db.payment.aggregate({ where, _count: { _all: true }, _sum: { amountCents: true } }),
    db.payment.aggregate({
      where: { ...where, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    db.refund.aggregate({ where: { ...where, status: { not: "failed" } }, _count: { _all: true }, _sum: { amountCents: true } }),
    db.attachment.aggregate({
      where: { ...where, ticketId: { not: null } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    db.attachment.aggregate({
      where: { ...where, ticketId: null, customerId: { not: null } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    db.attachment.aggregate({
      where: { ...where, ticketId: null, customerId: null, productId: { not: null } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    db.attachment.aggregate({
      where: { ...where, ticketId: null, customerId: null, productId: null },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    db.automaticProductPhoto.aggregate({
      where: { ...where, path: { not: null } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    signatureBytes(id),
    db.auditLog.findMany({
      where,
      orderBy: NEWEST_FIRST,
      take: 40,
      select: { id: true, action: true, summary: true, createdAt: true, user: { select: { name: true } } },
    }),
    db.location.count({ where: { ...where, active: true } }),
    db.apiKey.count({ where: { ...where, active: true } }),
    db.integrationConnection.findMany({
      where,
      orderBy: { provider: "asc" },
      select: { provider: true, status: true, lastSyncAt: true },
    }),
    Promise.all([
      db.customer.aggregate({ where, _max: { createdAt: true } }),
      db.ticket.aggregate({ where, _max: { createdAt: true } }),
      db.invoice.aggregate({ where: { ...where, recurringInvoiceId: null }, _max: { createdAt: true } }),
      db.payment.aggregate({ where, _max: { createdAt: true } }),
      db.auditLog.aggregate({ where, _max: { createdAt: true } }),
    ]).then((maxima) => latestDate(...maxima.map((row) => row._max.createdAt))),
    storageSnapshot(),
  ]);

  const lastActiveAt = latestDate(lastActivity, ...staff.map((person) => person.lastLoginAt));
  const footprint = storage.database?.get(id) ?? (storage.database ? { rows: 0, bytes: 0, tables: [] } : null);
  const logoBytes = shop.logoPath ? (storage.logos.get(id) ?? null) : 0;
  const files = {
    repairs: fileTotal(repairFiles),
    customers: fileTotal(customerFiles),
    products: fileTotal(productFiles),
    other: fileTotal(otherFiles),
    automaticPhotos: fileTotal(automaticPhotos),
    logoBytes,
  };
  const fileBytes =
    files.repairs.bytes +
    files.customers.bytes +
    files.products.bytes +
    files.other.bytes +
    files.automaticPhotos.bytes +
    (logoBytes ?? 0);

  return {
    admin,
    now,
    shop: {
      ...shop,
      status: shopStatus({ deletionRequestedAt: shop.deletionRequestedAt, lastActiveAt, createdAt: shop.createdAt }, now),
      lastActiveAt,
      owner: staff
        .filter((person) => person.role === "OWNER")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null,
      staff: [...staff].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
          a.name.localeCompare(b.name),
      ),
      usage: {
        customers,
        repairs,
        repairs30,
        invoices,
        invoices30,
        products,
        payments: { count: payments._count._all, cents: payments._sum.amountCents ?? 0 },
        payments30: { count: payments30._count._all, cents: payments30._sum.amountCents ?? 0 },
        refunds: { count: refunds._count._all, cents: refunds._sum.amountCents ?? 0 },
        locations,
        apiKeys,
        integrations,
      },
      storage: {
        files,
        fileBytes,
        database: footprint,
        signatureBytes: signatures,
        totalBytes: fileBytes + (footprint?.bytes ?? 0),
      },
      activity: audit.map((row) => auditToActivity({ ...row, shop: { id: shop.id, name: shop.name } })),
    },
    storage: storageStatus(storage),
  };
}

export type ShopDetail = NonNullable<Awaited<ReturnType<typeof readShopDetail>>["shop"]>;

/** "Count again": measure the database estimate and logo sizes now instead of waiting for the next refresh. */
export async function recountStorage(): Promise<void> {
  await requirePlatformAdmin();
  await storageSnapshot(true);
}
