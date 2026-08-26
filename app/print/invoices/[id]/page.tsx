import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBps, formatCents, invoiceTotals } from "@/lib/money";
import { formatDateLong, formatDate } from "@/components/billing/format";
import { loadShopHeader } from "@/components/billing/queries";
import {
  PrintSheet,
  type PrintTotalRow,
} from "@/components/billing/print-sheet";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

/** Drops empty parts and joins the rest — no stray commas on a printed address. */
function addressLines(parts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
}): string[] {
  const cityLine = [parts.city, parts.state].filter(Boolean).join(", ");
  const locality = [cityLine, parts.postalCode].filter(Boolean).join(" ");
  return [
    parts.address1,
    parts.address2,
    locality,
    parts.phone,
    parts.email,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [invoice, shop] = await Promise.all([
    db.invoice.findFirst({
      where: { id, shopId },
      include: {
        customer: true,
        lines: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
      },
    }),
    loadShopHeader(shopId),
  ]);
  if (!invoice || !shop) notFound();

  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  const customerName =
    invoice.customer.businessName ||
    `${invoice.customer.firstName} ${invoice.customer.lastName}`;

  const totalRows: PrintTotalRow[] = [
    { label: "Subtotal", value: formatCents(totals.subtotalCents) },
    {
      label: `Sales tax (${formatBps(invoice.taxRateBps)})`,
      value: formatCents(totals.taxCents),
    },
    { label: "Total", value: formatCents(totals.totalCents), strong: true },
    {
      label: "Payments & credits",
      value: `-${formatCents(totals.paidCents)}`,
    },
    {
      label: "Balance due",
      value: formatCents(Math.max(totals.balanceCents, 0)),
      emphasis: true,
    },
  ];

  return (
    <PrintSheet
      docLabel="INVOICE"
      docNote={invoice.status === "VOID" ? "Void — not payable" : undefined}
      number={invoice.number}
      shop={{ name: shop.name, lines: addressLines(shop) }}
      billTo={{
        name: customerName,
        lines: addressLines(invoice.customer),
      }}
      meta={[
        { label: "Invoice date", value: formatDate(invoice.createdAt) },
        { label: "Invoice #", value: String(invoice.number) },
        {
          label: "Due date",
          value: invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt",
        },
      ]}
      lines={invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        serial: line.serial,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      }))}
      showSerial={invoice.lines.some((line) => Boolean(line.serial))}
      totals={totalRows}
      payments={invoice.payments.map((payment) => ({
        id: payment.id,
        date: formatDate(payment.createdAt),
        method: METHOD_LABELS[payment.method] ?? payment.method,
        reference: payment.reference,
        amountCents: payment.amountCents,
      }))}
      notes={invoice.notes}
      signature={invoice.signatureDataUrl}
      signatureCaption={`Received by ${customerName}`}
      watermark={
        invoice.status === "PAID"
          ? "Paid"
          : invoice.status === "VOID"
            ? "Void"
            : null
      }
      backHref={`/invoices/${invoice.id}`}
      backLabel={`Back to invoice #${invoice.number}`}
      footer={
        invoice.paidAt
          ? `Paid in full on ${formatDateLong(invoice.paidAt)}. Thank you for your business!`
          : "Thank you for your business!"
      }
    />
  );
}
