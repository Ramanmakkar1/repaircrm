import type { ComponentProps } from "react";
import type { Prisma } from "@prisma/client";

import { formatCents } from "@/lib/money";
import { taxLabel } from "@/lib/tax";
import { formatDate, formatDateLong, formatDateTime } from "./format";
import { termsLabel } from "./print-chrome";
import { addressLines, type loadPrintShop } from "./print-queries";
import { refundAwareTotals } from "./refund-math";
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
    refunds: true;
  };
}>;

/**
 * The relations both invoice print routes load, in the order the sheet prints
 * them. One constant so the single and the batch page cannot load different
 * rows: the batch once printed $0.00 due on an invoice the screen said was
 * owing, because neither route loaded its refunds.
 */
export const PRINTABLE_INVOICE_INCLUDE = {
  customer: true,
  taxRate: { select: { name: true } },
  lines: { orderBy: { sortOrder: "asc" } },
  payments: { orderBy: { createdAt: "asc" } },
  refunds: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.InvoiceInclude;

export function invoiceSheetProps(
  invoice: PrintableInvoice,
  shop: PrintShop,
): ComponentProps<typeof PrintSheet> {
  // REFUND-AWARE, the same `refundAwareTotals` the invoice screen, the list,
  // the receipt and the statement use: money handed back puts that amount back
  // on the bill, so paper and screen always agree on what is owed.
  const totals = refundAwareTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
    invoice.refunds,
  );
  const customerName = partyName(invoice.customer);
  const zone = shop.timezone;

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
    // Only lines that carry money: "-$0.00 payments" on an unpaid bill reads
    // like a refund of nothing.
    ...(totals.paidCents > 0
      ? [{ label: "Payments received", value: `-${formatCents(totals.paidCents)}` }]
      : []),
    ...(totals.refundedCents > 0
      ? [{ label: "Refunded to you", value: `+${formatCents(totals.refundedCents)}` }]
      : []),
    balanceRow,
  ];

  // A failed card refund never left the shop, so it is not on the customer's copy.
  const refundRows = invoice.refunds.filter((refund) => refund.status !== "failed");

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
      // An instant, so the shop's day; the due date is a stored calendar day.
      { label: "Issue date", value: formatDate(invoice.createdAt, zone) },
      {
        label: "Due date",
        value: invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt",
      },
      { label: "Terms", value: termsLabel(invoice.createdAt, invoice.dueDate, zone) },
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
    payments: [
      ...invoice.payments.map((payment) => ({
        id: payment.id,
        date: formatDate(payment.createdAt, zone),
        method: METHOD_LABELS[payment.method] ?? payment.method,
        reference: payment.reference,
        amountCents: payment.amountCents,
      })),
      ...refundRows.map((refund) => ({
        id: refund.id,
        date: formatDate(refund.createdAt, zone),
        method: `Refund · ${METHOD_LABELS[refund.method] ?? refund.method}${
          refund.status === "pending" ? " (on its way)" : ""
        }`,
        reference: refund.reason,
        amountCents: -refund.amountCents,
      })),
    ],
    paymentsLabel: refundRows.length > 0 ? "Payments and refunds" : "Payments received",
    notes: invoice.notes,
    signature: invoice.signatureDataUrl,
    signatureCaption: `Received by ${customerName}`,
    watermark: paid ? "Paid" : voided ? "Void" : null,
    watermarkTone: voided ? "alarm" : "accent",
    backHref: `/invoices/${invoice.id}`,
    backLabel: `Back to invoice #${invoice.number}`,
    footer:
      invoice.paidAt && totals.balanceCents <= 0
        ? `Paid in full on ${formatDateLong(invoice.paidAt, zone)} — thank you!`
        : "Thank you for your business!",
    footerContact: contact ? `${shop.name}  ·  ${contact}` : shop.name,
  };
}

/**
 * Whether the printed invoice offers a "pay online" QR: only while something
 * is owed (refund-aware, like the balance above it). A void or settled invoice
 * prints none.
 */
export function invoiceIsPayable(invoice: PrintableInvoice): boolean {
  if (invoice.status === "VOID") return false;
  return refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds).balanceCents > 0;
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
  "Charges shown are the work so far, not a final bill. Devices not collected within 30 days of being ready may be charged for storage. Bring the claim check below when you collect.";

export function ticketSheetProps(
  ticket: PrintableTicket,
  shop: PrintShop,
  options: { showPasscode?: boolean } = {},
): ComponentProps<typeof TicketSheet> {
  const customerName = partyName(ticket.customer);

  // Two short lines, not five: the address on one, the phone and email on the
  // other, which is part of what keeps this sheet (and its claim check) on one page.
  const place = [shop.address1, shop.address2, [[shop.city, shop.state].filter(Boolean).join(", "), shop.postalCode].filter(Boolean).join(" ")]
    .filter((part) => Boolean(part && part.trim()))
    .join(", ");
  const reach = [shop.phone, shop.email].filter((part) => Boolean(part && part.trim())).join("  ·  ");

  return {
    number: ticket.number,
    shop: { name: shop.name, lines: [place, reach].filter(Boolean) },
    shopPhone: shop.phone,
    logoUrl: shop.logoUrl,
    customer: { name: customerName, lines: addressLines(ticket.customer) },
    // The number is in the masthead, so it is not repeated here (one row less
    // is part of what keeps the sheet on one page).
    meta: [
      { label: "Opened", value: formatDate(ticket.createdAt, shop.timezone) },
      { label: "Status", value: ticket.status },
      {
        label: "Priority",
        value: PRIORITY_LABELS[ticket.priority] ?? ticket.priority,
      },
      { label: "Technician", value: ticket.assignedTo?.name ?? "Unassigned" },
      {
        label: "Promised",
        // A repair's promise is an instant (a pickup time), so the shop's day.
        value: ticket.dueDate ? formatDate(ticket.dueDate, shop.timezone) : "—",
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
      ? `Authorised at intake · ${formatDateTime(ticket.intakeSignedAt, shop.timezone)}`
      : "Customer authorisation (intake)",
    resolved: ticket.status === "Resolved",
    backHref: `/tickets/${ticket.id}`,
    backLabel: `Back to repair #${ticket.number}`,
    terms: TICKET_TERMS,
    showPasscode: options.showPasscode ?? false,
  };
}
