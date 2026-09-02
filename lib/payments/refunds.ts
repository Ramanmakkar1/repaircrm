/**
 * Refunds that actually move money.
 *
 * BEFORE THIS FILE, `refundInvoiceAction` recorded the BUSINESS FACT of a
 * refund and a note in the dialog told staff to go and issue the real one from
 * the Stripe dashboard. Two systems, two chances to forget. Now a refund
 * against a Stripe-taken card payment calls Stripe, and the dialog says which
 * of the two things is about to happen.
 *
 * THE LIFECYCLE
 * -------------
 *   pending    the row is written and Stripe has been asked
 *   completed  Stripe said `succeeded` — synchronously, or later by webhook
 *   failed     Stripe refused. The row stays as the record of the attempt and
 *              stops counting against the invoice (see sumRefunds in
 *              components/billing/refund-math.ts).
 *
 * A manual refund — cash out of the till, a cheque, store credit — is born
 * "completed", because the money moved when the drawer opened.
 *
 * CONVERGENCE, NOT DELTAS
 * -----------------------
 * Every status change re-derives the invoice's status from freshly-read rows
 * rather than nudging it. `charge.refunded` and `refund.updated` both describe
 * the same event and either may arrive first, twice, or out of order; nothing
 * here cares, because nothing here counts.
 */

import { db } from "@/lib/db";
import { refundAwareTotals, statusForNetPaid } from "@/components/billing/refund-math";

import { accountFor } from "./account";
import { stripeFetch, type StripeCharge, type StripeRefundObject } from "./stripe";

/** What `Refund.status` may hold. */
export type RefundStatus = "pending" | "completed" | "failed";

/** Stripe's refund statuses, mapped onto ours. */
function mapStatus(stripeStatus: string | undefined | null): RefundStatus {
  if (stripeStatus === "succeeded") return "completed";
  if (stripeStatus === "failed" || stripeStatus === "canceled") return "failed";
  return "pending";
}

export type StripeRefundResult =
  | { ok: true; stripeRefundId: string; status: RefundStatus }
  | { ok: false; reason: string };

/**
 * Sends one refund to Stripe.
 *
 * The idempotency key is the LOCAL refund row's id, which is the whole reason
 * the row is written first: a retry, a double-click, or a Server Action
 * replayed by a flaky connection all resolve to the same key, and Stripe
 * returns the original refund instead of handing the customer their money back
 * twice.
 *
 * Refunding by `payment_intent` rather than by charge lets Stripe pick the
 * right charge itself, which matters on an intent that was retried.
 */
export async function createStripeRefund(input: {
  shopId: string;
  /** Our own `Refund.id`. Becomes the idempotency key. */
  refundId: string;
  paymentIntentId: string;
  amountCents: number;
  reason?: string | null;
}): Promise<StripeRefundResult> {
  const account = await accountFor(input.shopId);

  const result = await stripeFetch<StripeRefundObject>("/v1/refunds", {
    method: "POST",
    account,
    idempotencyKey: `refund-${input.refundId}`,
    body: {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      metadata: { shopId: input.shopId, refundId: input.refundId },
    },
  });

  if (!result.ok) return { ok: false, reason: result.message };
  if (!result.data.id) {
    return { ok: false, reason: "Stripe did not return a refund." };
  }

  return {
    ok: true,
    stripeRefundId: result.data.id,
    status: mapStatus(result.data.status),
  };
}

/**
 * Re-derives an invoice's status from the rows as they stand right now.
 *
 * Called after any refund status change. A refund that failed stops counting,
 * so an invoice knocked back to PARTIAL by an optimistic pending refund
 * returns to PAID by itself rather than needing a compensating write.
 *
 * VOID is left alone: a void invoice has no receivable to restate.
 */
export async function restateInvoiceForRefunds(
  shopId: string,
  invoiceId: string,
): Promise<void> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, shopId },
    select: {
      id: true,
      status: true,
      taxRateBps: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
      refunds: { select: { amountCents: true, status: true } },
    },
  });
  if (!invoice || invoice.status === "VOID") return;

  const totals = refundAwareTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
    invoice.refunds,
  );
  const nextStatus = statusForNetPaid(totals.netPaidCents, totals.totalCents);

  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: nextStatus,
      // A "Paid on" date must never outlive the money it refers to.
      paidAt: nextStatus === "PAID" ? undefined : null,
    },
  });
}

/**
 * Writes the outcome of a Stripe refund onto our row and restates the invoice.
 *
 * Idempotent by construction: setting a row that is already "completed" to
 * "completed" changes nothing, and the invoice recompute is a pure function of
 * the rows.
 */
export async function markRefundStatus(input: {
  shopId: string;
  refundId: string;
  status: RefundStatus;
  stripeRefundId?: string | null;
}): Promise<void> {
  const refund = await db.refund.findFirst({
    where: { id: input.refundId, shopId: input.shopId },
    select: { id: true, invoiceId: true },
  });
  if (!refund) return;

  await db.refund.update({
    where: { id: refund.id },
    data: {
      status: input.status,
      ...(input.stripeRefundId ? { stripeRefundId: input.stripeRefundId } : {}),
    },
  });

  await restateInvoiceForRefunds(input.shopId, refund.invoiceId);
}

// ---------------------------------------------------------------------------
// Webhook application
// ---------------------------------------------------------------------------

export type RefundApplyOutcome =
  | { status: "updated"; refundId: string; refundStatus: RefundStatus }
  | { status: "ignored"; reason: string };

/**
 * Completes (or fails) our row from a `refund.updated` event.
 *
 * Located by `stripeRefundId`, which we stored when the refund was created —
 * so an event for somebody else's refund, or for one created outside this app,
 * matches nothing and is acknowledged as none of our business.
 */
export async function applyRefundEvent(
  refund: StripeRefundObject,
  shopIdOverride?: string | null,
): Promise<RefundApplyOutcome> {
  const stripeRefundId = refund.id?.trim();
  if (!stripeRefundId) return { status: "ignored", reason: "refund has no id" };

  const row = await db.refund.findFirst({
    where: {
      stripeRefundId,
      ...(shopIdOverride ? { shopId: shopIdOverride } : {}),
    },
    select: { id: true, shopId: true, status: true },
  });
  if (!row) return { status: "ignored", reason: "refund is not one of ours" };

  const next = mapStatus(refund.status);
  if (row.status === next) {
    return { status: "ignored", reason: `already ${next}` };
  }

  await markRefundStatus({
    shopId: row.shopId,
    refundId: row.id,
    status: next,
  });
  return { status: "updated", refundId: row.id, refundStatus: next };
}

/**
 * Completes our rows from a `charge.refunded` event.
 *
 * The event's object is the CHARGE, carrying its refunds inline. Stripe sends
 * both this and `refund.updated` for the same money; handling both is belt and
 * braces, and the "already <status>" short-circuit above makes the second one
 * free.
 *
 * A refund issued from the Stripe dashboard rather than from this app arrives
 * here with an id we have never seen. That is reported as ignored rather than
 * invented as a Refund row: guessing which invoice a dashboard refund belongs
 * to is how books get quietly wrong.
 */
export async function applyChargeRefunded(
  charge: StripeCharge,
  shopIdOverride?: string | null,
): Promise<RefundApplyOutcome[]> {
  const refunds = charge.refunds?.data ?? [];
  if (refunds.length === 0) {
    return [{ status: "ignored", reason: "charge carried no refunds" }];
  }

  const outcomes: RefundApplyOutcome[] = [];
  for (const refund of refunds) {
    outcomes.push(
      await applyRefundEvent(
        { id: refund.id, status: refund.status, amount: refund.amount },
        shopIdOverride,
      ),
    );
  }
  return outcomes;
}
