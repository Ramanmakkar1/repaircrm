import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
import type { Period } from "./period";

/**
 * Server-only loader shared by the staff statement, the print sheet and the
 * "email statement" action, so all three can never disagree about a number.
 * Never import this from a Client Component — it pulls in Prisma.
 */

export type StatementInvoice = {
  id: string;
  number: number;
  status: string;
  createdAt: Date;
  dueDate: Date | null;
  totalCents: number;
  /** Every payment ever taken against this invoice, not just in-period ones. */
  paidCents: number;
  balanceCents: number;
};

export type StatementPayment = {
  id: string;
  createdAt: Date;
  method: string;
  reference: string | null;
  amountCents: number;
  invoiceId: string;
  invoiceNumber: number;
};

export type StatementData = {
  shop: {
    name: string;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
  };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    businessName: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    creditBalanceCents: number;
  };
  invoices: StatementInvoice[];
  payments: StatementPayment[];
  totals: {
    /** Billed in the period. Void invoices are excluded — they are not a debt. */
    invoicedCents: number;
    /** Received in the period, whichever invoice it landed on. */
    paidCents: number;
    /** Still owed on the period's invoices, as of right now. */
    outstandingCents: number;
    creditBalanceCents: number;
  };
};

export function statementCustomerName(customer: {
  firstName: string;
  lastName: string;
  businessName: string | null;
}): string {
  return (
    customer.businessName || `${customer.firstName} ${customer.lastName}`.trim()
  );
}

/**
 * Everything on a statement, or null when the customer is not this shop's.
 *
 * A statement is a summary, not a re-render of each invoice, so line items are
 * loaded only to total them — `Invoice` deliberately stores no denormalised
 * total (see the schema note), which means the sum has to be computed here with
 * the same `invoiceTotals` the invoice screen uses.
 */
export async function loadStatement(
  shopId: string,
  customerId: string,
  period: Period,
): Promise<StatementData | null> {
  const inPeriod = { gte: period.from, lt: period.toExclusive };

  const [shop, customer, invoiceRows, paymentRows] = await Promise.all([
    db.shop.findUnique({
      where: { id: shopId },
      select: {
        name: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        postalCode: true,
        phone: true,
        email: true,
      },
    }),
    // findFirst, not findUnique: an id from another shop must 404, not leak.
    db.customer.findFirst({
      where: { id: customerId, shopId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        email: true,
        phone: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        postalCode: true,
        creditBalanceCents: true,
      },
    }),
    db.invoice.findMany({
      where: { shopId, customerId, createdAt: inPeriod },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        dueDate: true,
        taxRateBps: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        payments: { select: { amountCents: true } },
      },
    }),
    // Payment carries shopId; scoping through the invoice narrows it to this
    // customer without trusting a customerId that never reaches the row.
    db.payment.findMany({
      where: { shopId, invoice: { customerId }, createdAt: inPeriod },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        method: true,
        reference: true,
        amountCents: true,
        invoice: { select: { id: true, number: true } },
      },
    }),
  ]);

  if (!shop || !customer) return null;

  const invoices: StatementInvoice[] = invoiceRows.map((invoice) => {
    const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      createdAt: invoice.createdAt,
      dueDate: invoice.dueDate,
      totalCents: totals.totalCents,
      paidCents: totals.paidCents,
      balanceCents: totals.balanceCents,
    };
  });

  const payments: StatementPayment[] = paymentRows.map((payment) => ({
    id: payment.id,
    createdAt: payment.createdAt,
    method: payment.method,
    reference: payment.reference,
    amountCents: payment.amountCents,
    invoiceId: payment.invoice.id,
    invoiceNumber: payment.invoice.number,
  }));

  const live = invoices.filter((invoice) => invoice.status !== "VOID");

  return {
    shop,
    customer,
    invoices,
    payments,
    totals: {
      invoicedCents: live.reduce((sum, i) => sum + i.totalCents, 0),
      paidCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
      // Overpayment on one invoice does not cancel a debt on another, so each
      // balance is floored at zero before summing.
      outstandingCents: live.reduce(
        (sum, i) => sum + Math.max(0, i.balanceCents),
        0,
      ),
      creditBalanceCents: customer.creditBalanceCents,
    },
  };
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

/** Drops empty parts — no stray commas on a printed address. */
export function addressLines(parts: {
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
