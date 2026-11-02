/**
 * How much database space each shop takes, estimated in ONE query.
 *
 * Every tenant table carries `shopId` (prisma/schema.prisma, convention 1), so
 * the estimate is a UNION ALL of `count(*)` and `sum(pg_column_size(row))` per
 * table, grouped by shop. The few child tables without a `shopId` (invoice
 * lines, contacts…) are reached through their parent, exactly as lib/db.ts
 * says app code must reach them. The table list is read from the database's
 * own catalog at run time, so a table added later is counted without a change
 * here.
 *
 * `pg_column_size` is the stored (possibly compressed) size of each row. It
 * leaves out indexes and free space, so the per-shop figures add up to less
 * than the whole database: an estimate, and labelled as one.
 *
 * Pure apart from building `Prisma.sql`, so the query shape is testable.
 */

import { Prisma } from "@prisma/client";

/** Tables without `shopId` that belong to a shop through a parent row. */
export const CHILD_TABLES = [
  { table: "InvoiceLine", parent: "Invoice", key: "invoiceId" },
  { table: "EstimateLine", parent: "Estimate", key: "estimateId" },
  { table: "RecurringInvoiceLine", parent: "RecurringInvoice", key: "recurringInvoiceId" },
  { table: "PurchaseOrderLine", parent: "PurchaseOrder", key: "purchaseOrderId" },
  { table: "Contact", parent: "Customer", key: "customerId" },
  { table: "PortalToken", parent: "Customer", key: "customerId" },
  { table: "PasswordResetToken", parent: "User", key: "userId" },
  { table: "EmailAuthCode", parent: "User", key: "userId" },
] as const;

export type FootprintSource =
  | { kind: "tenant"; table: string }
  | { kind: "shop"; table: "Shop" }
  | { kind: "child"; table: string; parent: string; key: string };

/**
 * Identifiers come from the catalog, never from a request, but they are still
 * checked before they are spliced into SQL: a name that is not a plain
 * identifier is skipped rather than quoted.
 */
export function quoteIdent(name: string): string | null {
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name) ? `"${name}"` : null;
}

/** What to count, from `information_schema.columns` rows of the current schema. */
export function footprintSources(columns: ReadonlyArray<{ table: string; column: string }>): FootprintSource[] {
  const has = new Set(columns.map((row) => `${row.table}.${row.column}`));
  const tables = [...new Set(columns.map((row) => row.table))].sort();
  const sources: FootprintSource[] = [];
  if (has.has("Shop.id")) sources.push({ kind: "shop", table: "Shop" });
  for (const table of tables) {
    // UsageCounter rows include platform-wide buckets ("*", "*platform") with no shop behind them.
    if (table === "UsageCounter" || !has.has(`${table}.shopId`) || !quoteIdent(table)) continue;
    sources.push({ kind: "tenant", table });
  }
  for (const child of CHILD_TABLES) {
    if (has.has(`${child.table}.${child.key}`) && has.has(`${child.parent}.shopId`) && has.has(`${child.parent}.id`)) {
      sources.push({ kind: "child", ...child });
    }
  }
  return sources;
}

/** One SELECT per source, glued with UNION ALL. Returns null when there is nothing to count. */
export function footprintQuery(sources: readonly FootprintSource[]): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];
  for (const source of sources) {
    const table = quoteIdent(source.table);
    if (!table) continue;
    if (source.kind === "shop") {
      parts.push(Prisma.sql`SELECT ${source.table}::text AS "table", t."id" AS "shopId", count(*)::bigint AS "rows", coalesce(sum(pg_column_size(t.*)), 0)::bigint AS "bytes" FROM ${Prisma.raw(table)} t GROUP BY t."id"`);
    } else if (source.kind === "tenant") {
      parts.push(Prisma.sql`SELECT ${source.table}::text AS "table", t."shopId" AS "shopId", count(*)::bigint AS "rows", coalesce(sum(pg_column_size(t.*)), 0)::bigint AS "bytes" FROM ${Prisma.raw(table)} t GROUP BY t."shopId"`);
    } else {
      const parent = quoteIdent(source.parent);
      const key = quoteIdent(source.key);
      if (!parent || !key) continue;
      parts.push(Prisma.sql`SELECT ${source.table}::text AS "table", p."shopId" AS "shopId", count(*)::bigint AS "rows", coalesce(sum(pg_column_size(t.*)), 0)::bigint AS "bytes" FROM ${Prisma.raw(table)} t JOIN ${Prisma.raw(parent)} p ON p."id" = t.${Prisma.raw(key)} GROUP BY p."shopId"`);
    }
  }
  if (parts.length === 0) return null;
  return Prisma.join(parts, " UNION ALL ");
}

export type TableFootprint = { table: string; label: string; rows: number; bytes: number };
export type ShopFootprint = { rows: number; bytes: number; tables: TableFootprint[] };

export type FootprintRow = { table: string; shopId: string | null; rows: bigint | number; bytes: bigint | number | null };

/** Per shop: total rows and bytes, and the tables biggest first. */
export function groupFootprint(rows: readonly FootprintRow[]): Map<string, ShopFootprint> {
  const shops = new Map<string, ShopFootprint>();
  for (const row of rows) {
    if (!row.shopId) continue;
    const count = Number(row.rows);
    const bytes = Number(row.bytes ?? 0);
    if (!(count > 0)) continue;
    const shop = shops.get(row.shopId) ?? { rows: 0, bytes: 0, tables: [] };
    shop.rows += count;
    shop.bytes += bytes;
    const existing = shop.tables.find((table) => table.table === row.table);
    if (existing) {
      existing.rows += count;
      existing.bytes += bytes;
    } else {
      shop.tables.push({ table: row.table, label: tableLabel(row.table), rows: count, bytes });
    }
    shops.set(row.shopId, shop);
  }
  for (const shop of shops.values()) {
    shop.tables.sort((a, b) => b.bytes - a.bytes || b.rows - a.rows || a.table.localeCompare(b.table));
  }
  return shops;
}

/** Plain names for the record types an owner would recognise; the rest are de-camel-cased. */
const TABLE_LABELS: Record<string, string> = {
  Shop: "Shop settings",
  User: "Staff logins",
  Ticket: "Repairs",
  TicketComment: "Repair notes and messages",
  TicketCharge: "Repair charges",
  Customer: "Customers",
  Asset: "Customer devices",
  Contact: "Customer contacts",
  Invoice: "Invoices",
  InvoiceLine: "Invoice lines",
  Estimate: "Estimates",
  EstimateLine: "Estimate lines",
  Payment: "Payments",
  Refund: "Refunds",
  Product: "Products",
  StockAdjustment: "Stock changes",
  ProductSerial: "Serial numbers",
  Attachment: "File records",
  AutomaticProductPhoto: "Automatic product photo records",
  CommunicationLog: "Emails and texts sent",
  AuditLog: "Activity log",
  Appointment: "Appointments",
  Lead: "Enquiries",
  PartOrder: "Part orders",
  PurchaseOrder: "Purchase orders",
  PurchaseOrderLine: "Purchase order lines",
  TimeEntry: "Time on repairs",
  TimeClockEntry: "Clock-ins",
  CashDrawerSession: "Cash drawer shifts",
  WebhookDelivery: "Webhook deliveries",
  ScanEvent: "Phone scans",
  ScanSession: "Phone scanner pairings",
};

export function tableLabel(table: string): string {
  if (TABLE_LABELS[table]) return TABLE_LABELS[table];
  const words = table.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
