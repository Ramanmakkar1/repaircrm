import type { Prisma } from "@prisma/client";

import { invoiceTotals } from "@/lib/money";

/**
 * The v1 payload shapes, in one file.
 *
 * WHY THIS FILE EXISTS: "don't expose the device password" is a rule that must
 * hold on every endpoint that can reach an Asset, forever. Enforcing it with a
 * `select` written out at each call site means one future copy-paste leaks it.
 * Here, the select and the serialiser sit next to each other and every handler
 * imports both.
 *
 * NEVER SERIALISED — not now, not by a later "just add this one field":
 *   Asset.password           the customer's device unlock code
 *   TicketComment (private)  internal notes; only `isPublic` comments ship
 *   Ticket.diagnosticNotes   the tech's working notes, written for colleagues
 *   Customer.notes           the front desk's internal notes on a person
 *   User.email / passwordHash  staff PII; a tech is exposed as a name only
 *
 * Money is always cents, matching the database and lib/money.ts. Dates are
 * always ISO 8601 UTC strings.
 */

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export const customerSelect = {
  id: true,
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
  country: true,
  smsOptIn: true,
  emailOptIn: true,
  creditBalanceCents: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;

export function serialiseCustomer(customer: CustomerRow) {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    businessName: customer.businessName,
    email: customer.email,
    phone: customer.phone,
    mobile: customer.mobile,
    address: {
      line1: customer.address1,
      line2: customer.address2,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postalCode,
      country: customer.country,
    },
    smsOptIn: customer.smsOptIn,
    emailOptIn: customer.emailOptIn,
    creditBalanceCents: customer.creditBalanceCents,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

/** The nested form used inside a ticket or invoice — identity, not a profile. */
export const customerSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  businessName: true,
  email: true,
  phone: true,
} satisfies Prisma.CustomerSelect;

type CustomerSummaryRow = Prisma.CustomerGetPayload<{
  select: typeof customerSummarySelect;
}>;

export function serialiseCustomerSummary(customer: CustomerSummaryRow) {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    businessName: customer.businessName,
    email: customer.email,
    phone: customer.phone,
  };
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

export const ticketSelect = {
  id: true,
  number: true,
  subject: true,
  problemType: true,
  status: true,
  priority: true,
  customerId: true,
  assetId: true,
  dueDate: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.TicketSelect;

type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

export function serialiseTicket(ticket: TicketRow) {
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    problemType: ticket.problemType,
    status: ticket.status,
    priority: ticket.priority,
    customerId: ticket.customerId,
    assetId: ticket.assetId,
    assignedTo: ticket.assignedTo
      ? { id: ticket.assignedTo.id, name: ticket.assignedTo.name }
      : null,
    dueDate: iso(ticket.dueDate),
    resolvedAt: iso(ticket.resolvedAt),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/**
 * Detail select.
 *
 * `comments` is filtered to `isPublic: true` IN THE QUERY, not in the mapper —
 * a private note must never be loaded into a process that is about to
 * JSON.stringify something. `asset` picks fields explicitly and omits
 * `password`.
 */
export const ticketDetailSelect = {
  ...ticketSelect,
  customer: { select: customerSummarySelect },
  asset: {
    select: { id: true, type: true, make: true, model: true, serial: true },
  },
  comments: {
    where: { isPublic: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      subject: true,
      channel: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  },
  charges: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPriceCents: true,
      taxable: true,
      invoiceId: true,
    },
  },
} satisfies Prisma.TicketSelect;

type TicketDetailRow = Prisma.TicketGetPayload<{ select: typeof ticketDetailSelect }>;

export function serialiseTicketDetail(ticket: TicketDetailRow) {
  return {
    ...serialiseTicket(ticket),
    customer: serialiseCustomerSummary(ticket.customer),
    asset: ticket.asset
      ? {
          id: ticket.asset.id,
          type: ticket.asset.type,
          make: ticket.asset.make,
          model: ticket.asset.model,
          serial: ticket.asset.serial,
        }
      : null,
    // Public updates only. Internal notes are not part of this API.
    comments: ticket.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      subject: comment.subject,
      channel: comment.channel,
      authorName: comment.author?.name ?? null,
      createdAt: comment.createdAt.toISOString(),
    })),
    charges: ticket.charges.map((charge) => ({
      id: charge.id,
      description: charge.description,
      quantity: charge.quantity,
      unitPriceCents: charge.unitPriceCents,
      taxable: charge.taxable,
      invoiceId: charge.invoiceId,
      amountCents: charge.quantity * charge.unitPriceCents,
    })),
  };
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

/**
 * Invoice totals are never stored (see the schema note on `Invoice`), so both
 * the list and the detail have to load lines and payments to answer with a
 * total. `lib/money.ts invoiceTotals` is the only place that maths happens, in
 * the API exactly as on the screens.
 */
export const invoiceSelect = {
  id: true,
  number: true,
  status: true,
  customerId: true,
  ticketId: true,
  estimateId: true,
  taxRateBps: true,
  notes: true,
  dueDate: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  lines: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      id: true,
      productId: true,
      description: true,
      quantity: true,
      unitPriceCents: true,
      taxable: true,
      serial: true,
      sortOrder: true,
    },
  },
  payments: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amountCents: true,
      method: true,
      reference: true,
      createdAt: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

function invoiceBase(invoice: InvoiceRow) {
  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    customerId: invoice.customerId,
    ticketId: invoice.ticketId,
    estimateId: invoice.estimateId,
    taxRateBps: invoice.taxRateBps,
    notes: invoice.notes,
    dueDate: iso(invoice.dueDate),
    paidAt: iso(invoice.paidAt),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    totals: {
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      paidCents: totals.paidCents,
      balanceCents: totals.balanceCents,
    },
  };
}

/** List form: totals, no line-by-line detail. */
export function serialiseInvoice(invoice: InvoiceRow) {
  return { ...invoiceBase(invoice), lineCount: invoice.lines.length };
}

export function serialiseInvoiceDetail(invoice: InvoiceRow) {
  return {
    ...invoiceBase(invoice),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxable: line.taxable,
      serial: line.serial,
      sortOrder: line.sortOrder,
      amountCents: line.quantity * line.unitPriceCents,
    })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      method: payment.method,
      reference: payment.reference,
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}
