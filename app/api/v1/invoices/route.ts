import { db } from "@/lib/db";
import { withApiKey } from "../_lib/handler";
import { listResponse, planList } from "../_lib/list";
import { apiError, queryParam } from "../_lib/respond";
import { invoiceSelect, serialiseInvoice } from "../_lib/shapes";

const STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"] as const;
type InvoiceStatus = (typeof STATUSES)[number];

/**
 * GET /api/v1/invoices?page=|cursor=&status=&customerId=
 *
 * Unlike a ticket status, an invoice status is a database enum, so an unknown
 * value is a caller mistake worth reporting rather than an empty page that
 * looks like "you have no invoices".
 *
 * Totals are computed per row from the lines and payments (nothing is
 * denormalised — see the schema note on `Invoice`), which is why the page size
 * matters: 50 invoices is a bounded amount of line loading.
 *
 * ORDERING: newest first by `createdAt`, like every other collection, so a
 * cursor means the same thing everywhere. Invoice numbers are allocated in
 * creation order, so this is the same sequence the old `number desc` gave.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const statusRaw = queryParam(url, "status")?.toUpperCase();
  const customerId = queryParam(url, "customerId");

  if (statusRaw && !STATUSES.includes(statusRaw as InvoiceStatus)) {
    return apiError(
      "invalid_request",
      `status must be one of ${STATUSES.join(", ")}.`,
    );
  }

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...(statusRaw ? { status: statusRaw as InvoiceStatus } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: invoiceSelect,
    }),
    db.invoice.count({ where }),
  ]);

  return listResponse(rows, serialiseInvoice, plan, total);
});
