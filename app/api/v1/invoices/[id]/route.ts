import { db } from "@/lib/db";
import { authApiKey, isDenied } from "../../_lib/auth";
import { apiError, apiItem } from "../../_lib/respond";
import { invoiceSelect, serialiseInvoiceDetail } from "../../_lib/shapes";

/**
 * GET /api/v1/invoices/{id}
 *
 * Lines, payments and totals. The totals come from lib/money.ts `invoiceTotals`
 * — the same function the invoice screen, the print sheet and the statement
 * use, so an integration can never disagree with the paper.
 *
 * An invoice id from another shop answers 404, not 403.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, shopId: auth.shopId },
    select: invoiceSelect,
  });

  if (!invoice) return apiError("not_found", "No invoice with that id.");

  return apiItem(serialiseInvoiceDetail(invoice));
}
