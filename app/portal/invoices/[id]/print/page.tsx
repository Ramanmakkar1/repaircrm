import { notFound } from "next/navigation";

import { formatDate, formatDateLong } from "@/components/billing/format";
import { termsLabel } from "@/components/billing/print-chrome";
import { loadPrintShop } from "@/components/billing/print-queries";
import { PrintSheet, type PrintTotalRow } from "@/components/billing/print-sheet";
import { refundAwareTotals } from "@/components/billing/refund-math";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { taxLabel } from "@/lib/tax";
import { getPortalSession, requirePortalCustomer } from "@/lib/portal-session";
import { PortalPrintRoot, addressLines } from "../../../_components/print-root";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

/**
 * The customer's own copy of the invoice — the same sheet staff print, reached
 * from "Print or save as PDF" and saved through the browser's own print dialog.
 *
 * Identical markup to /print/invoices/[id] because it IS the same component;
 * the only difference that matters is the guard. This page is authorised by the
 * portal cookie and scoped to `{ customerId, shopId }`, which is exactly why it
 * lives outside the /print segment: that segment's layout runs `requireUser()`,
 * and a customer has no staff session to satisfy it with.
 */

/**
 * The title matters more here than on a screen: it is what the browser's print
 * dialog offers as the PDF filename, so "Invoice #1042" beats "Your repairs".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getPortalSession();
  if (!session) return { title: "Invoice · Repairs helper" };

  const invoice = await db.invoice.findFirst({
    where: {
      id,
      customerId: session.customerId,
      shopId: session.shopId,
      // A draft has not been sent; the customer must not learn it exists.
      status: { not: "DRAFT" },
    },
    select: { number: true },
  });
  return {
    title: invoice
      ? `Invoice #${invoice.number} · Repairs helper`
      : "Invoice · Repairs helper",
  };
}

export default async function PortalInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await requirePortalCustomer(`/portal/invoices/${id}/print`);

  const [invoice, shop] = await Promise.all([
    db.invoice.findFirst({
      // Printing is reading: the same rule as the invoice page it prints.
      where: {
        id,
        customerId: customer.id,
        shopId: customer.shopId,
        status: { not: "DRAFT" },
      },
      include: {
        customer: true,
        taxRate: { select: { name: true } },
        lines: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
        refunds: { select: { amountCents: true, status: true } },
      },
    }),
    loadPrintShop(customer.shopId),
  ]);
  if (!invoice || !shop) notFound();

  const totals = refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds);
  const customerName =
    invoice.customer.businessName ||
    `${invoice.customer.firstName} ${invoice.customer.lastName}`;

  const voided = invoice.status === "VOID";
  const contact = [shop.phone, shop.email].filter(Boolean).join("  ·  ");

  const totalRows: PrintTotalRow[] = [
    { label: "Subtotal", value: formatCents(totals.subtotalCents) },
    {
      label: taxLabel(invoice.taxRate?.name, invoice.taxRateBps),
      value: formatCents(totals.taxCents),
    },
    { label: "Total", value: formatCents(totals.totalCents), strong: true },
    { label: "Payments & credits", value: `-${formatCents(totals.paidCents)}` },
    ...(totals.refundedCents > 0 ? [{ label: "Money returned", value: formatCents(totals.refundedCents) }] : []),
    voided
      ? { label: "Amount payable", value: formatCents(0), emphasis: true }
      : {
          label: "Balance due",
          value: formatCents(Math.max(totals.balanceCents, 0)),
          emphasis: true,
        },
  ];

  return (
    <PortalPrintRoot>
      <PrintSheet
        docLabel="Invoice"
        docNote={voided ? "Void — not payable" : undefined}
        number={invoice.number}
        shop={{ name: shop.name, lines: addressLines(shop) }}
        logoUrl={shop.logoUrl}
        billTo={{ name: customerName, lines: addressLines(invoice.customer) }}
        meta={[
          { label: "Invoice #", value: String(invoice.number) },
          // An instant, so the shop's own day; the due date is a stored calendar day.
          { label: "Issue date", value: formatDate(invoice.createdAt, shop.timezone) },
          {
            label: "Due date",
            value: invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt",
          },
          {
            label: "Terms",
            value: termsLabel(invoice.createdAt, invoice.dueDate, shop.timezone),
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
          date: formatDate(payment.createdAt, shop.timezone),
          method: METHOD_LABELS[payment.method] ?? payment.method,
          reference: payment.reference,
          amountCents: payment.amountCents,
        }))}
        notes={invoice.notes}
        signature={invoice.signatureDataUrl}
        signatureCaption={`Received by ${customerName}`}
        watermark={
          voided ? "Void" : totals.balanceCents <= 0 ? "Paid" : null
        }
        watermarkTone={voided ? "alarm" : "accent"}
        backHref={`/portal/invoices/${invoice.id}`}
        backLabel={`Back to invoice #${invoice.number}`}
        footer={
          invoice.paidAt && totals.balanceCents <= 0 && !voided
            ? `Paid in full on ${formatDateLong(invoice.paidAt, shop.timezone)} — thank you!`
            : "Thank you for your business!"
        }
        footerContact={contact ? `${shop.name}  ·  ${contact}` : shop.name}
      />
    </PortalPrintRoot>
  );
}
