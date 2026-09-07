import {
  refundAwareTotals,
  type RefundLike,
} from "@/components/billing/refund-math";
import { db } from "@/lib/db";
import { recordCreditSpend } from "@/lib/deposits";
import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { formatCents } from "@/lib/money";

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
 *
 *     That ceiling is REFUND-AWARE, and it is read INSIDE the transaction.
 *     Both of those were bugs:
 *
 *       · It used to use `invoiceTotals`, which is refund-blind. An invoice
 *         paid in full and then refunded in full shows the whole amount owed
 *         again on screen — `refundAwareTotals` says so, and the status walks
 *         back to SENT — while this function still saw `balance = 0` and
 *         refused every amount with "more than the $0.00 still outstanding".
 *         The screen invited a payment the till would not take.
 *
 *       · It used to read the invoice with a plain `findFirst` and then open a
 *         separate transaction that never re-read it. Two cashiers taking the
 *         last $50 both saw $50 outstanding, both passed the check, and both
 *         wrote — leaving the invoice overpaid by exactly the amount this rule
 *         exists to refuse. The read now happens inside a Serializable
 *         transaction, the same guarantee lib/payments/settle.ts already used
 *         for its dedupe.
 *   · CREDIT draws the customer's stored balance down inside the same
 *     transaction as the payment row, so a failure cannot spend credit twice
 *     or spend it for nothing — and writes the matching CreditAdjustment row,
 *     because a balance that moves with no explanation is exactly what that
 *     ledger exists to prevent.
 *
 * NOT the Stripe path. Money Stripe has ALREADY taken goes through
 * lib/payments/settle.ts, which dedupes on the Stripe ids and records an
 * overpayment rather than refusing it — the card is debited either way. The two
 * restate the invoice identically and emit the same events; they differ only on
 * the questions that only make sense before the money moves.
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

/**
 * A rule said no.
 *
 * Distinct from a database or serialization failure so the message reaching
 * the operator is the rule's own wording, not a Prisma string. Thrown rather
 * than returned because these checks now live inside the transaction, and the
 * only way out of a transaction callback is to throw.
 */
class PaymentRefused extends Error {}

export async function recordPayment(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  // Cheap rejection that needs no database read at all.
  if (input.amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  let paymentId: string;
  let nextStatus: "PAID" | "PARTIAL";
  let invoiceId: string;

  try {
    ({ paymentId, nextStatus, invoiceId } = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, shopId: input.shopId },
        select: {
          id: true,
          status: true,
          customerId: true,
          taxRateBps: true,
          number: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          payments: { select: { amountCents: true } },
          refunds: { select: { amountCents: true, status: true } },
        },
      });
      if (!invoice) throw new PaymentRefused("That invoice no longer exists.");

      if (invoice.status === "VOID") {
        throw new PaymentRefused(
          "This invoice is void — it cannot take payments.",
        );
      }

      const totals = refundAwareTotals(
        invoice.lines,
        invoice.taxRateBps,
        invoice.payments,
        invoice.refunds as RefundLike[],
      );
      if (totals.totalCents <= 0) {
        throw new PaymentRefused("Add line items before taking a payment.");
      }
      if (input.amountCents > totals.balanceCents) {
        throw new PaymentRefused(
          `That is more than the ${formatCents(totals.balanceCents)} still outstanding.`,
        );
      }

      const balanceAfter = totals.balanceCents - input.amountCents;
      const status: "PAID" | "PARTIAL" = balanceAfter <= 0 ? "PAID" : "PARTIAL";
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
        // The matching ledger row. Without it the customer's credit history
        // reads as a list of top-ups with money disappearing between them —
        // the balance moved and nothing said why.
        await recordCreditSpend(tx, {
          shopId: input.shopId,
          customerId: customer.id,
          amountCents: input.amountCents,
          invoiceNumber: invoice.number,
          userId: input.takenById ?? null,
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
          status,
          paidAt: balanceAfter <= 0 ? new Date() : null,
        },
      });

      return {
        paymentId: payment.id,
        nextStatus: status,
        invoiceId: invoice.id,
      };
    },
    // Serializable is what makes the ceiling above a real guarantee rather
    // than a hopeful one: two tills taking the last of a balance cannot both
    // read it as outstanding — one aborts and its operator retries.
    { isolationLevel: "Serializable" }));
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
    await emitInvoiceEvent(input.shopId, "invoice.paid", invoiceId);
  }

  return {
    ok: true,
    paymentId,
    invoiceStatus: nextStatus,
    settled: nextStatus === "PAID",
  };
}
