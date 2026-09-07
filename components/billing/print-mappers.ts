import type { ComponentProps } from "react";
import type { Prisma } from "@prisma/client";

import { formatCents, invoiceTotals } from "@/lib/money";
import { taxLabel } from "@/lib/tax";
import { formatDate, formatDateLong, formatDateTime } from "./format";
import { termsLabel } from "./print-chrome";
import { addressLines, type loadPrintShop } from "./print-queries";
import type { PrintSheet, PrintTotalRow } from "./print-sheet";
import type { TicketSheet } from "./print-ticket-sheet";

/**
 * ONE ROW OF A DOCUMENT'S PRINTED PROPS, DERIVED IN ONE PLACE.
 *
 * /print/invoices/[id] prints one invoice; /print/invoices?ids= prints a stack
 * of them for the list's bulk action. They render the same `PrintSheet`, and
 * they used to build its forty-odd props twice — two copies of the tax label,
 * the void-invoice balance rule, the payment-method dictionary and the "thank
 * you" footer. Nothing enforced that the copies agreed, so the first change to
 * either one would have quietly given a customer a different document from the
 * one the shop filed. Same story for the work order at /print/tickets.
 *
 * These mappers are the single derivation. The batch page differs from the
 * single page in exactly one prop now — `chrome`, which is off when a run of
 * sheets shares one toolbar — and that difference is visible at the call site
 * instead of buried in a hundred duplicated lines.
 *
 * DELIBERATELY NOT A RESTYLE. Every value below is the one that was already
 * being computed; the printed documents are a separate paper design (see
 * print-styles.ts) and this change must not move a single millimetre of them.
 *
 * Pure and server-safe: no `db`, no "use client" imports at runtime.
 */

export type PrintShop = NonNullable<Awaited<ReturnType<typeof loadPrintShop>>>;

/** How a payment method reads on paper. */
const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

/** Business name when there is one, otherwise the person — as on every sheet. */
function partyName(customer: {
  businessName: string | null;
  firstName: string;
  lastName: string;
}): string {
  return customer.businessName || `${customer.firstName} ${customer.lastName}`;
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

/**
 * Exactly the shape both invoice print routes query. Written as a Prisma
 * payload rather than by hand so adding a column to the query cannot silently
 * drift from what the mapper reads.
 */
export type PrintableInvoice = Prisma.InvoiceGetPayload<{
  include: {
    customer: true;
    taxRate: { select: { name: true } };
    lines: true;
    payments: true;
  };
}>;

export function invoiceSheetProps(
  invoice: PrintableInvoice,
  shop: PrintShop,
): ComponentProps<typeof PrintSheet> {
  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  const customerName = partyName(invoice.customer);

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
      label: taxLabel(invoice.taxRate?.name, invoice.taxRateBps),
      value: formatCents(totals.taxCents),
    },
    { label: "Total", value: formatCents(totals.totalCents), strong: true },
    { label: "Payments & credits", value: `-${formatCents(totals.paidCents)}` },
    balanceRow,
  ];

  const contact = [shop.phone, shop.email].filter(Boolean).join("  ·  ");

  return {
    docLabel: "Invoice",
    docNote: voided ? "Void — not payable" : undefined,
    number: invoice.number,
    shop: { name: shop.name, lines: addressLines(shop) },
    logoUrl: shop.logoUrl,
    billTo: { name: customerName, lines: addressLines(invoice.customer) },
    meta: [
      { label: "Invoice #", value: String(invoice.number) },
      { label: "Issue date", value: formatDate(invoice.createdAt) },
      {
        label: "Due date",
        value: invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt",
      },
      { label: "Terms", value: termsLabel(invoice.createdAt, invoice.dueDate) },
    ],
    lines: invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      serial: line.serial,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxable: line.taxable,
      warrantyDays: line.warrantyDays,
    })),
    showSerial: invoice.lines.some((line) => Boolean(line.serial)),
    totals: totalRows,
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      date: formatDate(payment.createdAt),
      method: METHOD_LABELS[payment.method] ?? payment.method,
      reference: payment.reference,
      amountCents: payment.amountCents,
    })),
    notes: invoice.notes,
    signature: invoice.signatureDataUrl,
    signatureCaption: `Received by ${customerName}`,
    watermark: paid ? "Paid" : voided ? "Void" : null,
    watermarkTone: voided ? "alarm" : "accent",
    backHref: `/invoices/${invoice.id}`,
    backLabel: `Back to invoice #${invoice.number}`,
    footer: invoice.paidAt
      ? `Paid in full on ${formatDateLong(invoice.paidAt)} — thank you!`
      : "Thank you for your business!",
    footerContact: contact ? `${shop.name}  ·  ${contact}` : shop.name,
  };
}

// ---------------------------------------------------------------------------
// Work order
// ---------------------------------------------------------------------------

export type PrintableTicket = Prisma.TicketGetPayload<{
  include: {
    customer: true;
    asset: true;
    assignedTo: { select: { name: true } };
    charges: true;
  };
}>;

/**
 * The paragraph at the foot of every work order. A constant, not a prop with a
 * default, because a batch sheet that promised different storage terms from the
 * single sheet would be a promise the shop did not make.
 */
const TICKET_TERMS =
  "Charges shown are work recorded to date and are not a final invoice. Devices not collected within 30 days of completion may incur storage fees. Please present the claim check below when collecting.";

export function ticketSheetProps(
  ticket: PrintableTicket,
  shop: PrintShop,
): ComponentProps<typeof TicketSheet> {
  const customerName = partyName(ticket.customer);

  return {
    number: ticket.number,
    shop: { name: shop.name, lines: addressLines(shop) },
    shopPhone: shop.phone,
    logoUrl: shop.logoUrl,
    customer: { name: customerName, lines: addressLines(ticket.customer) },
    meta: [
      { label: "Ticket #", value: String(ticket.number) },
      { label: "Opened", value: formatDate(ticket.createdAt) },
      { label: "Status", value: ticket.status },
      {
        label: "Priority",
        value: PRIORITY_LABELS[ticket.priority] ?? ticket.priority,
      },
      { label: "Technician", value: ticket.assignedTo?.name ?? "Unassigned" },
      {
        label: "Promised",
        value: ticket.dueDate ? formatDate(ticket.dueDate) : "—",
      },
    ],
    subject: ticket.subject,
    problemType: ticket.problemType,
    device: ticket.asset
      ? {
          type: ticket.asset.type,
          make: ticket.asset.make,
          model: ticket.asset.model,
          serial: ticket.asset.serial,
          password: ticket.asset.password,
          notes: ticket.asset.notes,
        }
      : null,
    diagnosis: ticket.diagnosticNotes,
    charges: ticket.charges.map((charge) => ({
      id: charge.id,
      description: charge.description,
      quantity: charge.quantity,
      unitPriceCents: charge.unitPriceCents,
      taxable: charge.taxable,
    })),
    taxRateBps: shop.taxRateBps,
    intakeSignature: ticket.intakeSignatureDataUrl,
    intakeSignedCaption: ticket.intakeSignedAt
      ? `Authorised at intake · ${formatDateTime(ticket.intakeSignedAt)}`
      : "Customer authorisation (intake)",
    resolved: ticket.status === "Resolved",
    backHref: `/tickets/${ticket.id}`,
    backLabel: `Back to ticket #${ticket.number}`,
    terms: TICKET_TERMS,
  };
}
