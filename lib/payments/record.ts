import { db } from "@/lib/db";
import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { formatCents, invoiceTotals } from "@/lib/money";

/**
 * Recording a manual payment — the ONE implementation.
 *
 * The counter form (app/(app)/invoices/actions.ts takePaymentAction) and
 * POST /api/v1/payments both land here. They must, because a payment is not one
 * insert: it draws down store credit, it writes the Payment row, and it restates
 * the invoice — and those three either all happen or none of them do.
 *
 * THE RULES, in the order they are checked:
 *
 *   · a VOID invoice takes no payments — the receivable is gone
 *   · an invoice with no lines has nothing to pay
 *   · the amount may not exceed the outstanding balance. Nobody has been
 *     charged yet at this point (unlike the Stripe webhook, which records an
 *     overpayment in full because the card was already debited), so the right
 *     answer to "that is too much" is to say so and let the operator retype it.
 *   · CREDIT draws the customer's stored balance down inside the same
 *     transaction as the payment row, so a failure cannot spend credit twice
 *     or spend it for nothing.
 *
 * STATUS: balance after this payment <= 0 -> PAID with `paidAt` stamped;
 * otherwise PARTIAL with `paidAt` cleared. Identical to the Stripe path.
 *
 * EVENTS are emitted here, after the commit, so every route that records money
 * announces it the same way and none of them has to remember to.
 */

export type PaymentMethodName = "CASH" | "CARD" | "CHECK" | "OTHER" | "CREDIT";

export const PAYMENT_METHODS: readonly PaymentMethodName[] = [
  "CASH",
  "CARD",
  "CHECK",
  "OTHER",
  "CREDIT",
];

export type RecordPaymentInput = {
  shopId: string;
  invoiceId: string;
  amountCents: number;
  method: PaymentMethodName;
  reference?: string | null;
  /** The staff member taking it, or null for a machine-recorded payment. */
  takenById?: string | null;
};

export type RecordPaymentResult =
  | {
      ok: true;
      paymentId: string;
      invoiceStatus: "PAID" | "PARTIAL";
      /** True when this payment cleared the balance. */
      settled: boolean;
    }
  | { ok: false; error: string };

export async function recordPayment(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  const invoice = await db.invoice.findFirst({
    where: { id: input.invoiceId, shopId: input.shopId },
    select: {
      id: true,
      status: true,
      customerId: true,
      taxRateBps: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
    },
  });
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };

  if (invoice.status === "VOID") {
    return { ok: false, error: "This invoice is void — it cannot take payments." };
  }
  if (input.amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  if (totals.totalCents <= 0) {
    return { ok: false, error: "Add line items before taking a payment." };
  }
  if (input.amountCents > totals.balanceCents) {
    return {
      ok: false,
      error: `That is more than the ${formatCents(totals.balanceCents)} still outstanding.`,
    };
  }

  const balanceAfter = totals.balanceCents - input.amountCents;
  const nextStatus: "PAID" | "PARTIAL" = balanceAfter <= 0 ? "PAID" : "PARTIAL";

  let paymentId: string;

  try {
    paymentId = await db.$transaction(async (tx) => {
      // Store credit is real money already held for the customer, so drawing it
      // down and writing the payment must succeed or fail together.
      if (input.method === "CREDIT") {
        const customer = await tx.customer.findFirst({
          where: { id: invoice.customerId, shopId: input.shopId },
          select: { id: true, creditBalanceCents: true },
        });
        if (!customer) throw new Error("Customer not found.");
        if (customer.creditBalanceCents < input.amountCents) {
          throw new Error(
            `Only ${formatCents(customer.creditBalanceCents)} of store credit is available.`,
          );
        }
        await tx.customer.update({
          where: { id: customer.id },
          data: { creditBalanceCents: { decrement: input.amountCents } },
        });
      }

      const payment = await tx.payment.create({
        data: {
          shopId: input.shopId,
          invoiceId: invoice.id,
          amountCents: input.amountCents,
          method: input.method,
          reference: input.reference ?? null,
          takenById: input.takenById ?? null,
        },
        select: { id: true },
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: nextStatus,
          paidAt: balanceAfter <= 0 ? new Date() : null,
        },
      });

      return payment.id;
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not record that payment.",
    };
  }

  // After the commit, never inside it: a queued webhook for a rolled-back
  // transaction would announce money that never arrived.
  await emitPaymentEvent(input.shopId, paymentId);
  if (nextStatus === "PAID") {
    await emitInvoiceEvent(input.shopId, "invoice.paid", invoice.id);
  }

  return {
    ok: true,
    paymentId,
    invoiceStatus: nextStatus,
    settled: nextStatus === "PAID",
  };
}
