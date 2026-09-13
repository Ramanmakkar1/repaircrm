import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
import {
  csvAmount,
  csvResponse,
  requireOwner,
  type CsvValue,
} from "../_lib/csv";

/**
 * GET /api/exports/customers.csv
 *
 * The customer list with an open balance per row, for importing into
 * QuickBooks' customer centre.
 *
 * NOT date-ranged, deliberately: a customer list is a roster, not a period.
 * `?from=&to=` is accepted-and-ignored so the same link shape works from every
 * card on /reports.
 *
 * "Balance" is accounts receivable — what this customer still owes on SENT and
 * PARTIAL invoices — which is what QuickBooks means by a customer balance. It
 * is NOT `creditBalanceCents`, which is the opposite: money the shop is holding
 * *for* them. Each invoice balance is floored at zero before summing, so an
 * overpayment on one invoice cannot quietly cancel a real debt on another.
 */
export async function GET() {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const customers = await db.customer.findMany({
    where: { shopId: guard.shopId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      firstName: true,
      lastName: true,
      businessName: true,
      email: true,
      phone: true,
      mobile: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      invoices: {
        where: { status: { in: ["SENT", "PARTIAL"] } },
        select: {
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          payments: { select: { amountCents: true } },
        },
      },
    },
  });

  const rows: CsvValue[][] = [
    [
      "Name",
      "Company",
      "Email",
      "Phone",
      "Street",
      "City",
      "State",
      "Zip",
      "Balance",
    ],
  ];

  for (const customer of customers) {
    const balanceCents = customer.invoices.reduce((sum, invoice) => {
      const { balanceCents: due } = invoiceTotals(
        invoice.lines,
        invoice.taxRateBps,
        invoice.payments,
      );
      return sum + Math.max(0, due);
    }, 0);

    // Two address lines collapse into one Street cell — QuickBooks' importer
    // takes a single street field, and a lost "Unit 4" is a lost delivery.
    const street = [customer.address1, customer.address2]
      .filter((part) => part && part.trim())
      .join(", ");

    rows.push([
      `${customer.firstName} ${customer.lastName}`.trim(),
      customer.businessName ?? "",
      customer.email ?? "",
      customer.phone ?? customer.mobile ?? "",
      street,
      customer.city ?? "",
      customer.state ?? "",
      customer.postalCode ?? "",
      csvAmount(balanceCents),
    ]);
  }

  return csvResponse(rows, "repairpilot-customers.csv");
}
