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
 * The deposit register: every payment received in the window, one row each.
 * Reconciles against the Revenue card on /reports for the same period — both
 * count `Payment.createdAt`, not the invoice date, because a payment belongs
 * to the day the money arrived.
 *
 * `Payment` carries its own shopId, but the customer name has to come through
 * the invoice, so the query is scoped on both.
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const range = parseRange(new URL(request.url));

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

  const rows: CsvValue[][] = [
    ["Date", "InvoiceNo", "Customer", "Amount", "Method", "Reference"],
  ];

  for (const payment of payments) {
    rows.push([
      csvDate(payment.createdAt),
      payment.invoice.number,
      customerLabel(payment.invoice.customer),
      csvAmount(payment.amountCents),
      PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
      payment.reference ?? "",
    ]);
  }

  return csvResponse(
    rows,
    `repairflow-payments-${range.fromValue}-to-${range.toValue}.csv`,
  );
}
