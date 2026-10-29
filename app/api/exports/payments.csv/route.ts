import { db } from "@/lib/db";
import { PAYMENT_METHOD_LABELS } from "@/components/statements/query";
import {
  csvAmount,
  csvDate,
  csvResponse,
  customerLabel,
  parseRange,
  requireOwner,
  type CsvValue,
} from "../_lib/csv";

/**
 * GET /api/exports/payments.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The deposit register: every payment received in the window, one row each,
 * and every refund given back as a negative row (Reference "Refund …"), so the
 * Amount column sums to the "Money in after refunds" card on /reports for the
 * same period. Both count `createdAt`, not the invoice date, because money
 * belongs to the day it moved. Refunds are counted as the report counts them:
 * anything not failed.
 *
 * `Payment` carries its own shopId, but the customer name has to come through
 * the invoice, so the query is scoped on both.
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const shop = await db.shop.findUnique({ where: { id: guard.shopId }, select: { timezone: true } });
  const zone = shop?.timezone ?? "UTC";
  const range = parseRange(new URL(request.url), new Date(), zone);

  const payments = await db.payment.findMany({
    where: {
      shopId: guard.shopId,
      createdAt: { gte: range.from, lt: range.toExclusive },
    },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      amountCents: true,
      method: true,
      reference: true,
      invoice: {
        select: {
          number: true,
          customer: {
            select: { firstName: true, lastName: true, businessName: true },
          },
        },
      },
    },
  });

  const refunds = await db.refund.findMany({
    where: {
      shopId: guard.shopId,
      createdAt: { gte: range.from, lt: range.toExclusive },
      status: { not: "failed" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      amountCents: true,
      method: true,
      reason: true,
      invoice: {
        select: {
          number: true,
          customer: {
            select: { firstName: true, lastName: true, businessName: true },
          },
        },
      },
    },
  });

  const rows: CsvValue[][] = [
    ["Date", "InvoiceNo", "Customer", "Amount", "Method", "Reference"],
  ];

  const entries = [
    ...payments.map((payment) => ({ at: payment.createdAt, row: [
      csvDate(payment.createdAt, zone),
      payment.invoice.number,
      customerLabel(payment.invoice.customer),
      csvAmount(payment.amountCents),
      PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
      payment.reference ?? "",
    ] as CsvValue[] })),
    ...refunds.map((refund) => ({ at: refund.createdAt, row: [
      csvDate(refund.createdAt, zone),
      refund.invoice.number,
      customerLabel(refund.invoice.customer),
      csvAmount(-refund.amountCents),
      PAYMENT_METHOD_LABELS[refund.method] ?? refund.method,
      refund.reason ? `Refund: ${refund.reason}` : "Refund",
    ] as CsvValue[] })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const entry of entries) rows.push(entry.row);

  return csvResponse(
    rows,
    `repairpilot-payments-${range.fromValue}-to-${range.toValue}.csv`,
  );
}
