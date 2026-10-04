"use server";

import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/comms";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/components/billing/format";
import { loadShopZone } from "@/components/billing/print-queries";
import { invoiceStatusLabel } from "@/components/billing/status-badge";
import { resolvePeriod } from "@/components/statements/period";
import {
  PAYMENT_METHOD_LABELS,
  loadStatement,
  statementCustomerName,
} from "@/components/statements/query";

/**
 * Emails a customer their statement.
 *
 * The message is plain text on purpose. `lib/comms` wraps whatever body it is
 * given in the shop's branded template and files exactly one outbox row, so a
 * statement shows up in the customer's communication history next to every
 * other thing the shop has sent them — and a bounced send records a failure
 * there rather than throwing.
 */

export type EmailStatementResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Right-pads for the fixed-width columns of a plaintext ledger. */
function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

export async function emailStatementAction(input: {
  customerId: string;
  from: string;
  to: string;
}): Promise<EmailStatementResult> {
  const { shopId } = await requireUser();

  // The statement's days are the shop's days, as on the screen it was sent from.
  const zone = await loadShopZone(shopId);
  const period = resolvePeriod(input.from, input.to, new Date(), zone);
  const statement = await loadStatement(shopId, input.customerId, period);
  if (!statement) return { ok: false, error: "That customer no longer exists." };

  const { customer, shop, invoices, payments, refunds, totals } = statement;
  if (!customer.email) {
    return { ok: false, error: "This customer has no email address on file." };
  }

  const range = `${formatDate(period.from)} – ${formatDate(period.to)}`;

  const invoiceBlock =
    invoices.length === 0
      ? "No invoices were raised in this period."
      : [
          `${pad("Invoice", 10)}${pad("Date", 15)}${pad("Status", 10)}${padStart(
            "Total",
            12,
          )}${padStart("Balance", 12)}`,
          ...invoices.map(
            (invoice) =>
              `${pad(`#${invoice.number}`, 10)}${pad(
                formatDate(invoice.createdAt, zone),
                15,
              )}${pad(invoiceStatusLabel(invoice.status), 10)}${padStart(
                formatCents(invoice.totalCents),
                12,
              )}${padStart(
                invoice.status === "VOID"
                  ? "—"
                  : formatCents(Math.max(0, invoice.balanceCents)),
                12,
              )}`,
          ),
        ].join("\n");

  const paymentBlock =
    payments.length === 0 && refunds.length === 0
      ? null
      : [
          refunds.length > 0 ? "Payments and refunds" : "Payments received",
          ...payments.map(
            (payment) =>
              `${pad(formatDate(payment.createdAt, zone), 15)}${pad(
                `#${payment.invoiceNumber}`,
                10,
              )}${pad(
                PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
                14,
              )}${padStart(formatCents(payment.amountCents), 12)}`,
          ),
          // Money handed back is on the customer's copy too, so the balance
          // below adds up from the lines above it.
          ...refunds.map(
            (refund) =>
              `${pad(formatDate(refund.createdAt, zone), 15)}${pad(
                `#${refund.invoiceNumber}`,
                10,
              )}${pad("Refund", 14)}${padStart(`-${formatCents(refund.amountCents)}`, 12)}`,
          ),
        ].join("\n");

  const summary = [
    `Total invoiced:      ${formatCents(totals.invoicedCents)}`,
    `Total paid:          ${formatCents(totals.paidCents)}`,
    ...(totals.refundedCents > 0
      ? [`Refunded to you:     ${formatCents(totals.refundedCents)}`]
      : []),
    `Balance outstanding: ${formatCents(totals.outstandingCents)}`,
    ...(totals.creditBalanceCents > 0
      ? [`Store credit held:   ${formatCents(totals.creditBalanceCents)}`]
      : []),
  ].join("\n");

  const body = [
    `Hi ${customer.firstName},`,
    `Here is your account statement for ${range}.`,
    invoiceBlock,
    ...(paymentBlock ? [paymentBlock] : []),
    summary,
    totals.outstandingCents > 0
      ? "You can settle any outstanding balance from your portal using the button below."
      : "Nothing is outstanding — thank you!",
  ].join("\n\n");

  const result = await sendEmail({
    shopId,
    customerId: customer.id,
    subject: `Statement from ${shop.name}`,
    body,
    context: `Statement · ${range}`,
    portalPath: "/portal",
  });

  if (!result.ok) {
    // "skipped: opted out" / "failed: …" — say what actually happened rather
    // than claiming a send that never left the building.
    return { ok: false, error: `Statement not sent (${result.status}).` };
  }

  return {
    ok: true,
    message:
      result.status === "logged"
        ? `Statement written to the outbox for ${statementCustomerName(customer)} (email driver is in log mode).`
        : `Statement emailed to ${customer.email}.`,
  };
}
