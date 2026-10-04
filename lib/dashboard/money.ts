/**
 * The money queries behind the dashboard and the Home strip.
 *
 * Server-only (it pulls in Prisma). Every query is filtered by the session's
 * `shopId`; the branch follows the document it belongs to, the same way
 * components/reports/query.ts does it, so a number here is the number on
 * /reports for the same day and the same branch.
 *
 * Callers must check `canSeeMoney(role)` BEFORE calling anything in this file:
 * a technician's page never runs these queries at all, rather than running them
 * and hiding the answer.
 */

import { db } from "@/lib/db";
import { customerLabel } from "@/components/customers/format";
import { primaryPhone, telHref } from "@/components/customers/customer-facts";
import { resolveReportPeriod } from "@/components/reports/period";
import { DAY_MS, type OwedInvoice, type PaymentRow, type ProductLine, type RefundRow } from "./logic";

/** Owners and front desk see money; technicians do not. Same rule as the Reports page. */
export function canSeeMoney(role: string): boolean {
  return role === "OWNER" || role === "FRONT_DESK";
}

/**
 * Today as Reports defines it: a UTC calendar day. Asking Reports' own period
 * maths (a one-day custom range) is what keeps the two screens in step if that
 * convention ever changes.
 */
export function todayWindow(nowMs: number): { key: string; from: number; toExclusive: number } {
  const key = new Date(nowMs).toISOString().slice(0, 10);
  const period = resolveReportPeriod({ period: "custom", from: key, to: key }, new Date(nowMs));
  return { key, from: period.from.getTime(), toExclusive: period.from.getTime() + DAY_MS };
}

/** Payments and refunds in [from, toExclusive): everything the takings figures are made of. */
export async function loadTakingsRows(
  shopId: string,
  locationId: string | undefined,
  from: number,
  toExclusive: number,
): Promise<{ payments: PaymentRow[]; refunds: RefundRow[] }> {
  const inRange = { gte: new Date(from), lt: new Date(toExclusive) };
  // A payment and a refund belong to a branch through their invoice.
  const viaInvoice = locationId ? { invoice: { locationId } } : {};

  const [payments, refunds] = await Promise.all([
    db.payment.findMany({
      where: { shopId, createdAt: inRange, ...viaInvoice },
      select: { amountCents: true, method: true, createdAt: true },
    }),
    db.refund.findMany({
      where: { shopId, createdAt: inRange, ...viaInvoice },
      select: { amountCents: true, createdAt: true },
    }),
  ]);

  return {
    payments: payments.map((row) => ({ amountCents: row.amountCents, method: row.method, createdAt: row.createdAt.getTime() })),
    refunds: refunds.map((row) => ({ amountCents: row.amountCents, createdAt: row.createdAt.getTime() })),
  };
}

/** More unpaid invoices than this and the total is reported as "at least". */
export const OWED_INVOICE_CAP = 2000;

/**
 * Every sent or part-paid invoice, with what is needed to total its balance.
 * Voided and draft invoices are not debts, and the two statuses are the ones the
 * invoices list calls "Unpaid".
 */
export async function loadOwedInvoices(
  shopId: string,
  locationId: string | undefined,
): Promise<{ invoices: OwedInvoice[]; truncated: boolean }> {
  const rows = await db.invoice.findMany({
    where: { shopId, status: { in: ["SENT", "PARTIAL"] }, ...(locationId ? { locationId } : {}) },
    orderBy: { createdAt: "desc" },
    take: OWED_INVOICE_CAP,
    select: {
      id: true,
      number: true,
      dueDate: true,
      taxRateBps: true,
      customer: { select: { id: true, firstName: true, lastName: true, businessName: true, phone: true, mobile: true } },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
      refunds: { select: { amountCents: true, status: true } },
    },
  });

  const invoices: OwedInvoice[] = rows.map((row) => {
    const phone = primaryPhone(row.customer).value;
    return {
      id: row.id,
      number: row.number,
      customerId: row.customer.id,
      customerName: customerLabel(row.customer),
      callHref: phone ? telHref(phone) : null,
      dueAt: row.dueDate ? row.dueDate.getTime() : null,
      taxRateBps: row.taxRateBps,
      lines: row.lines,
      payments: row.payments,
      refunds: row.refunds,
    };
  });
  return { invoices, truncated: rows.length >= OWED_INVOICE_CAP };
}

/** Product lines on invoices raised in [from, toExclusive), void invoices excluded: Reports' "Top products" input. */
export async function loadProductLines(
  shopId: string,
  locationId: string | undefined,
  from: number,
  toExclusive: number,
): Promise<ProductLine[]> {
  const lines = await db.invoiceLine.findMany({
    where: {
      productId: { not: null },
      invoice: { shopId, createdAt: { gte: new Date(from), lt: new Date(toExclusive) }, status: { not: "VOID" }, locationId },
    },
    take: 5000,
    select: { productId: true, quantity: true, unitPriceCents: true, product: { select: { name: true } } },
  });
  return lines.map((line) => ({
    productId: line.productId,
    name: line.product?.name ?? "Unnamed product",
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
  }));
}
