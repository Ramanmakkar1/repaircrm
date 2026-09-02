/**
 * Writing down money that Stripe says it took.
 *
 * ONE FUNCTION, FOUR CALLERS
 * --------------------------
 *   checkout webhook       checkout.session.completed
 *   payment_intent webhook payment_intent.succeeded
 *   card on file           the Server Action that confirms an off-session PI
 *   terminal               the Server Action that records a card-present PI
 *
 * They all end in the same place because they all mean the same thing, and
 * because two of those pairs race each other by design: charging a card on
 * file records the payment immediately AND provokes a webhook that would record
 * it again. The dedupe below is what makes that safe, so neither path has to
 * know whether it won.
 *
 * DEDUPE KEYS — BOTH OF THEM
 * --------------------------
 * A Checkout payment is identifiable by its session id (`cs_…`, stored in
 * `Payment.reference`) and by its PaymentIntent id. The two events carry
 * different ones, so matching on either is what stops a second row. This is
 * why `Payment.stripePaymentIntentId` exists as a column rather than being
 * folded into `reference`.
 *
 * OVERPAYMENT IS RECORDED, NOT REFUSED
 * ------------------------------------
 * The counter form refuses an amount larger than the balance because nobody
 * has been charged yet. Here the card is already debited. Money that arrived
 * and was not written down is the one outcome with no recovery, so the full
 * amount goes in and the invoice simply settles.
 *
 * THE OTHER HALF
 * --------------
 * Keyed-in money — the till form and POST /api/v1/payments — goes through
 * lib/payments/record.ts instead. The two restate the invoice by the identical
 * rule and emit the identical events; they differ only where "already charged"
 * changes the answer (overpayment, and the dedupe keys above).
 */

import { db } from "@/lib/db";
import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { invoiceTotals } from "@/lib/money";

/** Where a Stripe payment came from. Mirrors `Payment.stripeSource`. */
export type StripeSource = "checkout" | "card_on_file" | "terminal";

export type SettleInput = {
  shopId: string;
  invoiceId: string;
  amountCents: number;
  /**
   * Human-readable audit handle stored on `Payment.reference` — the Checkout
   * session id for hosted payments, the PaymentIntent id otherwise. Also the
   * first dedupe key.
   */
  reference: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  source: StripeSource;
  /** The cashier, when a human was standing there. Null for webhooks. */
  takenById?: string | null;
};

export type SettleOutcome =
  /** A payment row was written and the invoice status recomputed. */
  | { status: "recorded"; paymentId: string; invoiceStatus: string }
  /** Already applied, or nothing to apply. Safe, expected, and a 200. */
  | { status: "ignored"; reason: string }
  /** The write failed. The caller should ask Stripe to redeliver. */
  | { status: "error"; reason: string };

/**
 * Records one Stripe payment against one invoice, exactly once.
 *
 * STATUS RECOMPUTE — mirrors takePaymentAction in app/(app)/invoices/actions.ts:
 *   balance after this payment <= 0  →  PAID,    paidAt = now
 *   balance after this payment  > 0  →  PARTIAL, paidAt = null
 */
export async function settleStripePayment(
  input: SettleInput,
): Promise<SettleOutcome> {
  const outcome = await writeStripePayment(input);

  // After the commit, never inside it: a queued webhook for a rolled-back
  // transaction would announce money that never arrived. Emitted here rather
  // than in each caller so a card payment announces itself exactly like a
  // keyed-in one (lib/payments/record.ts does the same).
  if (outcome.status === "recorded") {
    await emitPaymentEvent(input.shopId, outcome.paymentId);
    if (outcome.invoiceStatus === "PAID") {
      await emitInvoiceEvent(input.shopId, "invoice.paid", input.invoiceId);
    }
  }

  return outcome;
}

async function writeStripePayment(
  input: SettleInput,
): Promise<SettleOutcome> {
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { status: "ignored", reason: "no amount to record" };
  }
  if (!input.shopId || !input.invoiceId || !input.reference) {
    return { status: "ignored", reason: "incomplete settlement" };
  }

  try {
    return await db.$transaction(
      async (tx) => {
        // Scoped by BOTH ids. Even on an authenticated webhook these are ids
        // that arrived over the wire: a mismatched pair finds nothing and
        // writes nothing.
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, shopId: input.shopId },
          select: {
            id: true,
            status: true,
            taxRateBps: true,
            lines: {
              select: { quantity: true, unitPriceCents: true, taxable: true },
            },
            payments: { select: { amountCents: true } },
          },
        });
        if (!invoice) {
          return {
            status: "ignored" as const,
            reason: "invoice not found for that shop",
          };
        }

        // Re-checked INSIDE the transaction, not before it: two simultaneous
        // deliveries of the same event both pass an outside check.
        const existing = await tx.payment.findFirst({
          where: {
            invoiceId: invoice.id,
            OR: [
              { reference: input.reference },
              ...(input.paymentIntentId
                ? [{ stripePaymentIntentId: input.paymentIntentId }]
                : []),
            ],
          },
          select: { id: true },
        });
        if (existing) {
          return { status: "ignored" as const, reason: "already recorded" };
        }

        if (invoice.status === "VOID") {
          // Voided after the customer was charged. The money is real and needs
          // refunding by hand; silently marking a void invoice paid would hide
          // that from whoever has to do it.
          console.error(
            `[payments] ${input.reference} paid ${amountCents} against VOID invoice ${invoice.id} — refund required`,
          );
          return { status: "ignored" as const, reason: "invoice is void" };
        }

        const totals = invoiceTotals(
          invoice.lines,
          invoice.taxRateBps,
          invoice.payments,
        );
        const balanceAfter = totals.balanceCents - amountCents;
        const nextStatus = balanceAfter <= 0 ? "PAID" : "PARTIAL";

        const payment = await tx.payment.create({
          data: {
            shopId: input.shopId,
            invoiceId: invoice.id,
            amountCents,
            method: "CARD",
            reference: input.reference,
            stripePaymentIntentId: input.paymentIntentId,
            stripeChargeId: input.chargeId,
            stripeSource: input.source,
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

        return {
          status: "recorded" as const,
          paymentId: payment.id,
          invoiceStatus: nextStatus,
        };
      },
      // Serializable turns the read-then-write above into a real guarantee:
      // concurrent duplicate deliveries cannot both pass the dedupe check, one
      // of them aborts, and the caller asks Stripe to redeliver.
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    console.error("[payments] failed to settle stripe payment:", error);
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "write failed",
    };
  }
}
