import { db } from "@/lib/db";

/**
 * Warranty on a sold line.
 *
 * `Product.warrantyDays` is the *policy*; `InvoiceLine.warrantyDays` is the
 * SNAPSHOT taken when the line was sold. Changing the policy later must never
 * shorten (or lengthen) cover a customer already bought, which is why every
 * invoice-creating path copies the number across at creation time instead of
 * reading through to the product.
 *
 * The clock starts on the invoice date, so expiry is purely derived — there is
 * no stored end date to drift.
 */

/** Quick picks offered on the product form. */
export const WARRANTY_PRESETS = [
  { value: 0, label: "None" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "1 year" },
] as const;

export const MAX_WARRANTY_DAYS = 3650;

const DAY_MS = 24 * 60 * 60 * 1000;

export function warrantyExpiresAt(soldAt: Date, days: number): Date {
  return new Date(soldAt.getTime() + days * DAY_MS);
}

export function warrantyActive(
  soldAt: Date,
  days: number,
  now: number = Date.now(),
): boolean {
  return warrantyExpiresAt(soldAt, days).getTime() >= now;
}

/** "90 days" / "1 year" — how cover reads on a document. */
export function warrantyLabel(days: number): string {
  if (days === 365) return "1 year";
  if (days === 730) return "2 years";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Warranty policy for a set of products, as a map. One query for the whole
 * document rather than one per line.
 *
 * Scoped by shopId: a productId that arrived on a line but belongs to another
 * tenant simply has no entry, and the line is written with no warranty.
 */
export async function warrantyDaysByProduct(
  shopId: string,
  productIds: (string | null | undefined)[],
): Promise<Map<string, number>> {
  const ids = [...new Set(productIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const products = await db.product.findMany({
    where: { id: { in: ids }, shopId, warrantyDays: { not: null } },
    select: { id: true, warrantyDays: true },
  });

  return new Map(
    products
      .filter((p) => (p.warrantyDays ?? 0) > 0)
      .map((p) => [p.id, p.warrantyDays as number]),
  );
}

export type WarrantyLine = {
  id: string;
  description: string;
  invoiceId: string;
  invoiceNumber: number;
  soldAt: Date;
  days: number;
  expiresAt: Date;
  active: boolean;
};

/**
 * Every warranted line ever sold to one customer, newest first.
 *
 * Reached through the invoice (an InvoiceLine carries no shopId of its own),
 * which is exactly the tenant boundary lib/db.ts describes for child rows.
 */
export async function customerWarranties(
  shopId: string,
  customerId: string,
  options: { activeOnly?: boolean; now?: number } = {},
): Promise<WarrantyLine[]> {
  const now = options.now ?? Date.now();

  const lines = await db.invoiceLine.findMany({
    where: {
      warrantyDays: { not: null },
      invoice: { shopId, customerId, status: { not: "VOID" } },
    },
    orderBy: { invoice: { createdAt: "desc" } },
    select: {
      id: true,
      description: true,
      warrantyDays: true,
      invoice: { select: { id: true, number: true, createdAt: true } },
    },
  });

  const rows = lines.map((line) => {
    const days = line.warrantyDays ?? 0;
    const soldAt = line.invoice.createdAt;
    const expiresAt = warrantyExpiresAt(soldAt, days);
    return {
      id: line.id,
      description: line.description,
      invoiceId: line.invoice.id,
      invoiceNumber: line.invoice.number,
      soldAt,
      days,
      expiresAt,
      active: expiresAt.getTime() >= now,
    };
  });

  return options.activeOnly ? rows.filter((row) => row.active) : rows;
}

/**
 * Every LIVE warranty in the shop, bucketed by customer.
 *
 * One query for the whole intake screen rather than one per customer: the
 * new-ticket form needs the list for whichever customer the operator picks,
 * and firing a request on every change of the picker would be slower and
 * chattier for no benefit. Capped, because a busy shop's back catalogue is not
 * something a form needs all of.
 */
export async function activeWarrantiesByCustomer(
  shopId: string,
  limit = 500,
  now: number = Date.now(),
): Promise<Map<string, WarrantyLine[]>> {
  const lines = await db.invoiceLine.findMany({
    where: {
      warrantyDays: { not: null },
      invoice: { shopId, status: { not: "VOID" } },
    },
    orderBy: { invoice: { createdAt: "desc" } },
    take: limit,
    select: {
      id: true,
      description: true,
      warrantyDays: true,
      invoice: {
        select: { id: true, number: true, createdAt: true, customerId: true },
      },
    },
  });

  const out = new Map<string, WarrantyLine[]>();
  for (const line of lines) {
    const days = line.warrantyDays ?? 0;
    const soldAt = line.invoice.createdAt;
    const expiresAt = warrantyExpiresAt(soldAt, days);
    if (expiresAt.getTime() < now) continue;

    const row: WarrantyLine = {
      id: line.id,
      description: line.description,
      invoiceId: line.invoice.id,
      invoiceNumber: line.invoice.number,
      soldAt,
      days,
      expiresAt,
      active: true,
    };
    const bucket = out.get(line.invoice.customerId);
    if (bucket) bucket.push(row);
    else out.set(line.invoice.customerId, [row]);
  }
  return out;
}
