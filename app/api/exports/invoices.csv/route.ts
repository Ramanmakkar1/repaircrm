import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
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
 * GET /api/exports/invoices.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * QuickBooks-importable invoice register: ONE ROW PER LINE ITEM, with the
 * invoice-level fields (number, customer, dates, status) repeated on each row.
 * That is the shape QuickBooks' "Invoices" import expects — it groups rows by
 * InvoiceNo and treats every row as a line.
 *
 * TaxAmount is deliberately written only on an invoice's FIRST row and left
 * blank on the rest. Tax is calculated once on the taxable subtotal (see
 * lib/money.ts calcTotals) precisely so it cannot drift line by line; repeating
 * the figure on every row would import as tax-times-lines.
 *
 * An invoice with no lines still emits one row, so the register and the
 * Invoices screen always agree on how many documents exist. Void invoices are
 * included with Status "VOID" — an accountant needs to see that a number was
 * issued and cancelled, not find a hole in the sequence.
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const range = parseRange(new URL(request.url));

  const invoices = await db.invoice.findMany({
    where: {
      shopId: guard.shopId,
      createdAt: { gte: range.from, lt: range.toExclusive },
    },
    orderBy: { number: "asc" },
    select: {
      number: true,
      status: true,
      createdAt: true,
      dueDate: true,
      taxRateBps: true,
      customer: {
        select: { firstName: true, lastName: true, businessName: true },
      },
      lines: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          description: true,
          quantity: true,
          unitPriceCents: true,
          taxable: true,
        },
      },
    },
  });

  const rows: CsvValue[][] = [
    [
      "InvoiceNo",
      "Customer",
      "InvoiceDate",
      "DueDate",
      "ItemDescription",
      "ItemQuantity",
      "ItemRate",
      "ItemAmount",
      "TaxAmount",
      "Status",
    ],
  ];

  for (const invoice of invoices) {
    const totals = invoiceTotals(invoice.lines, invoice.taxRateBps);
    const name = customerLabel(invoice.customer);
    const invoiceDate = csvDate(invoice.createdAt);
    const dueDate = csvDate(invoice.dueDate);

    if (invoice.lines.length === 0) {
      rows.push([
        invoice.number,
        name,
        invoiceDate,
        dueDate,
        "",
        "",
        "",
        csvAmount(0),
        csvAmount(0),
        invoice.status,
      ]);
      continue;
    }

    invoice.lines.forEach((line, index) => {
      rows.push([
        invoice.number,
        name,
        invoiceDate,
        dueDate,
        line.description,
        line.quantity,
        csvAmount(line.unitPriceCents),
        csvAmount(line.quantity * line.unitPriceCents),
        index === 0 ? csvAmount(totals.taxCents) : "",
        invoice.status,
      ]);
    });
  }

  return csvResponse(
    rows,
    `repairflow-invoices-${range.fromValue}-to-${range.toValue}.csv`,
  );
}
