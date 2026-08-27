import { db } from "@/lib/db";
import { authApiKey, isDenied } from "../_lib/auth";
import {
  apiError,
  apiList,
  PAGE_SIZE,
  parsePage,
  queryParam,
  skipFor,
} from "../_lib/respond";
import { invoiceSelect, serialiseInvoice } from "../_lib/shapes";

const STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"] as const;
type InvoiceStatus = (typeof STATUSES)[number];

/**
 * GET /api/v1/invoices?page=&status=
 *
 * Unlike a ticket status, an invoice status is a database enum, so an unknown
 * value is a caller mistake worth reporting rather than an empty page that
 * looks like "you have no invoices".
 *
 * Totals are computed per row from the lines and payments (nothing is
 * denormalised — see the schema note on `Invoice`), which is why the page size
 * matters: 50 invoices is a bounded amount of line loading.
 */
export async function GET(request: Request) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const url = new URL(request.url);
  const page = parsePage(url);
  const statusRaw = queryParam(url, "status")?.toUpperCase();

  if (statusRaw && !STATUSES.includes(statusRaw as InvoiceStatus)) {
    return apiError(
      "invalid_request",
      `status must be one of ${STATUSES.join(", ")}.`,
    );
  }

  const where = {
    shopId: auth.shopId,
    ...(statusRaw ? { status: statusRaw as InvoiceStatus } : {}),
  };

  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { number: "desc" },
      skip: skipFor(page),
      take: PAGE_SIZE,
      select: invoiceSelect,
    }),
    db.invoice.count({ where }),
  ]);

  return apiList(rows.map(serialiseInvoice), { page, total });
}
