import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBps, formatCents, invoiceTotals } from "@/lib/money";
import { formatDateLong, formatDate } from "@/components/billing/format";
import { addressLines, loadPrintShop } from "@/components/billing/print-queries";
import { termsLabel } from "@/components/billing/print-chrome";
import {
  PrintSheet,
  type PrintTotalRow,
} from "@/components/billing/print-sheet";

export const metadata: Metadata = { title: "Invoice · RepairFlow" };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

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
    loadPrintShop(shopId),
  ]);
  if (!invoice || !shop) notFound();

  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  const customerName =
    invoice.customer.businessName ||
    `${invoice.customer.firstName} ${invoice.customer.lastName}`;

  const paid = invoice.status === "PAID";
  const voided = invoice.status === "VOID";

  // The balance panel is the loudest thing on the page, so it has to say what
  // is actually true: a void invoice is not a debt, whatever its lines total.
  const balanceRow: PrintTotalRow = voided
    ? { label: "Amount payable", value: formatCents(0), emphasis: true }
    : {
        label: "Balance due",
        value: formatCents(Math.max(totals.balanceCents, 0)),
        emphasis: true,
      };

  const totalRows: PrintTotalRow[] = [
    { label: "Subtotal", value: formatCents(totals.subtotalCents) },
    {
      label: `Sales tax (${formatBps(invoice.taxRateBps)})`,
      value: formatCents(totals.taxCents),
    },
    { label: "Total", value: formatCents(totals.totalCents), strong: true },
    { label: "Payments & credits", value: `-${formatCents(totals.paidCents)}` },
    balanceRow,
  ];

  const contact = [shop.phone, shop.email].filter(Boolean).join("  ·  ");

  return (
    <PrintSheet
      docLabel="Invoice"
      docNote={voided ? "Void — not payable" : undefined}
      number={invoice.number}
      shop={{ name: shop.name, lines: addressLines(shop) }}
      logoUrl={shop.logoUrl}
      billTo={{ name: customerName, lines: addressLines(invoice.customer) }}
      meta={[
        { label: "Invoice #", value: String(invoice.number) },
        { label: "Issue date", value: formatDate(invoice.createdAt) },
        {
          label: "Due date",
          value: invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt",
        },
        {
          label: "Terms",
          value: termsLabel(invoice.createdAt, invoice.dueDate),
        },
      ]}
      lines={invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        serial: line.serial,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxable: line.taxable,
        warrantyDays: line.warrantyDays,
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
      watermark={paid ? "Paid" : voided ? "Void" : null}
      watermarkTone={voided ? "alarm" : "accent"}
      backHref={`/invoices/${invoice.id}`}
      backLabel={`Back to invoice #${invoice.number}`}
      footer={
        invoice.paidAt
          ? `Paid in full on ${formatDateLong(invoice.paidAt)} — thank you!`
          : "Thank you for your business!"
      }
      footerContact={
        contact ? `${shop.name}  ·  ${contact}` : shop.name
      }
    />
  );
}
