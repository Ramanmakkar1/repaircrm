"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { renderEmail, renderSms, sendEmail, sendSms } from "@/lib/comms";
import { invoiceMessage, receiptMessage } from "@/lib/comms/documents";
import { db } from "@/lib/db";
import { emitInvoiceEvent } from "@/lib/events";
import { newRecordLocationId } from "@/lib/location";
import { formatCents, parseCents } from "@/lib/money";
import { warrantyDaysByProduct } from "@/lib/warranty";
import {
  chargeCardOnFile,
  createInvoiceCheckout,
  createStripeRefund,
  markRefundStatus,
  paymentsLive,
  recordTerminalPayment,
} from "@/lib/payments";
import {
  PAYMENT_METHODS,
  recordPayment,
  type PaymentMethodName,
} from "@/lib/payments/record";
import { withNextNumber } from "@/lib/sequence";
import {
  SerialError,
  markInvoiceSerialsSold,
  releaseInvoiceSerials,
  syncSerializedStock,
} from "@/lib/serials";
import { fromDateInputValue } from "@/components/billing/format";
import { resolveDocumentTax } from "@/components/billing/queries";
import {
  refundAwareTotals,
  statusForNetPaid,
} from "@/components/billing/refund-math";
import {
  describeOutcome,
  type SendChannelOutcome,
  type SendPreviewState,
  type SendRequest,
  type SendResultState,
} from "@/components/billing/send-types";
import {
  formError,
  formSuccess,
  parseLines,
  type FormState,
} from "@/components/billing/types";

/**
 * Invoice mutations.
 *
 * Every action re-reads its target with `findFirst({ id, shopId })` so a forged
 * id from another tenant 404s instead of leaking or mutating a row — the
 * session is the only source of truth for `shopId`, never the form.
 *
 * STATUS RULES (enforced here, mirrored in the UI as disabled buttons):
 *   DRAFT  → SENT              Mark sent
 *   DRAFT  → VOID              Void (OWNER only, no payments)
 *   SENT   → VOID              Void (OWNER only, no payments)
 *   any of DRAFT/SENT/PARTIAL  → PARTIAL when a payment leaves a balance
 *   any of DRAFT/SENT/PARTIAL  → PAID    when a payment clears the balance
 *   PAID / VOID                terminal — lines are frozen, no new payments
 *
 * SERIALS: a line that names a serial number of a serialized product claims a
 * specific physical unit. Saving the invoice marks that unit SOLD and attaches
 * it to the line; rewriting the lines releases the old units first; voiding
 * puts them all back. `syncSerializedStock` then makes the product's on-hand
 * level agree with how many units are actually in stock, writing the move as
 * one StockAdjustment. Non-serialized lines are untouched — an ordinary
 * invoice still does not move stock, only the register does.
 */

type Line = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  serial: string | null;
};

const EDITABLE_STATUSES = ["DRAFT", "SENT"] as const;

/**
 * Mirrors the `PaymentMethod` enum. Declared locally rather than imported from
 * @prisma/client because a `"use server"` module may only export async
 * functions — a re-exported enum would fail the build.
 */
type RefundMethod = "CASH" | "CARD" | "CHECK" | "OTHER" | "CREDIT";
const REFUND_METHODS: readonly RefundMethod[] = [
  "CASH",
  "CARD",
  "CHECK",
  "OTHER",
  "CREDIT",
];

/** Resolves the customer, refusing anything outside the session's shop. */
async function resolveCustomer(shopId: string, raw: FormDataEntryValue | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  return db.customer.findFirst({ where: { id, shopId } });
}

/** Optional ticket link; a ticket from another shop is silently dropped. */
async function resolveTicketId(shopId: string, raw: FormDataEntryValue | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  const ticket = await db.ticket.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  return ticket?.id ?? null;
}

function readNotes(formData: FormData): string | null {
  const notes = String(formData.get("notes") ?? "").trim();
  return notes === "" ? null : notes.slice(0, 5000);
}

/**
 * `warranty` is the product-policy map for the products on these lines. The
 * days are SNAPSHOTTED onto the line here, so changing a product's warranty
 * later never restates cover a customer already bought.
 */
/**
 * Claims the serialized units this invoice's lines name, and squares the
 * affected products' on-hand levels with reality.
 *
 * `alsoTouched` carries products whose units were RELEASED earlier in the same
 * transaction (a rewrite): they have to be recounted even when the new lines
 * do not mention them, or a removed line would leave the level a unit short.
 */
async function settleSerials(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string,
  invoiceId: string,
  invoiceNumber: number,
  alsoTouched: readonly string[] = []
): Promise<void> {
  const sold = await markInvoiceSerialsSold(tx, { shopId, invoiceId });
  const productIds = [
    ...sold.map((unit) => unit.productId),
    ...alsoTouched,
  ];
  if (productIds.length === 0) return;

  await syncSerializedStock(tx, {
    shopId,
    userId,
    productIds,
    reason: `Sold — invoice #${invoiceNumber}`,
  });
}

function lineCreateData(lines: Line[], warranty?: Map<string, number>) {
  return lines.map((line, index) => ({
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    taxable: line.taxable,
    serial: line.serial,
    warrantyDays:
      line.productId && warranty ? (warranty.get(line.productId) ?? null) : null,
    sortOrder: index,
  }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createInvoiceAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId, userId } = await requireUser();

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this invoice.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  // Snapshot the rate now — a later settings change must not silently restate
  // an invoice the customer has already been shown. The id rides along so the
  // printed document can name the tax ("GST 5%") rather than only quote it.
  const tax = await resolveDocumentTax(
    shopId,
    customer.id,
    formData.get("taxRateId"),
  );

  const ticketId = await resolveTicketId(shopId, formData.get("ticketId"));
  const locationId = await newRecordLocationId(shopId, userId);
  const warranty = await warrantyDaysByProduct(
    shopId,
    parsed.lines.map((line) => line.productId),
  );

  let invoiceId: string;
  try {
    invoiceId = await withNextNumber(shopId, "invoice", (number) =>
      db.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            shopId,
            customerId: customer.id,
            ticketId,
            locationId,
            number,
            status: "DRAFT",
            taxRateId: tax.taxRateId,
            taxRateBps: tax.taxRateBps,
            notes: readNotes(formData),
            dueDate: fromDateInputValue(formData.get("date")),
            lines: { create: lineCreateData(parsed.lines, warranty) },
          },
          select: { id: true, number: true },
        });
        await settleSerials(tx, shopId, userId, created.id, created.number);
        return created.id;
      })
    );
  } catch (error) {
    if (error instanceof SerialError) return formError(error.message);
    throw error;
  }

  await emitInvoiceEvent(shopId, "invoice.created", invoiceId);

  revalidatePath("/invoices");
  revalidatePath("/inventory");
  redirect(`/invoices/${invoiceId}`);
}

// ---------------------------------------------------------------------------
// Edit lines
// ---------------------------------------------------------------------------

export async function updateInvoiceAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId, userId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    select: { id: true, number: true, status: true },
  });
  if (!invoice) return formError("That invoice no longer exists.");

  if (!EDITABLE_STATUSES.includes(invoice.status as "DRAFT" | "SENT")) {
    return formError(
      `A ${invoice.status.toLowerCase()} invoice cannot be edited. Void it and raise a new one instead.`
    );
  }

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this invoice.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  const warranty = await warrantyDaysByProduct(
    shopId,
    parsed.lines.map((line) => line.productId),
  );

  // Replace-all rather than diff: line ids are not surfaced to the client, and
  // an invoice has a handful of rows, so a clean rewrite is both simpler and
  // immune to a stale id from a concurrent edit. Serialized units are released
  // BEFORE the rewrite and re-claimed after, so a line that kept its serial
  // nets to no stock movement at all.
  //
  // An unpaid invoice can still be re-taxed; a paid or void one never reaches
  // here (EDITABLE_STATUSES above).
  const tax = await resolveDocumentTax(
    shopId,
    customer.id,
    formData.get("taxRateId"),
  );

  try {
    await db.$transaction(async (tx) => {
      const released = await releaseInvoiceSerials(tx, {
        shopId,
        invoiceId: invoice.id,
      });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          customerId: customer.id,
          taxRateId: tax.taxRateId,
          taxRateBps: tax.taxRateBps,
          notes: readNotes(formData),
          dueDate: fromDateInputValue(formData.get("date")),
          lines: { create: lineCreateData(parsed.lines, warranty) },
        },
      });
      await settleSerials(
        tx,
        shopId,
        userId,
        invoice.id,
        invoice.number,
        released.map((unit) => unit.productId)
      );
    });
  } catch (error) {
    if (error instanceof SerialError) return formError(error.message);
    throw error;
  }

  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath(`/invoices/${invoice.id}`);
  redirect(`/invoices/${invoice.id}`);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function takePaymentAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId, userId } = await requireUser();

  const method = String(formData.get("method") ?? "CARD").toUpperCase();
  if (!PAYMENT_METHODS.includes(method as PaymentMethodName)) {
    return formError("Pick a payment method.");
  }

  // The settlement itself — credit draw-down, payment row, invoice restatement
  // and the outbound events — lives in lib/payments/record.ts, because
  // POST /api/v1/payments has to do exactly the same thing and two copies of
  // "what does taking money mean" is how a till and an API start disagreeing.
  const result = await recordPayment({
    shopId,
    invoiceId: String(formData.get("invoiceId") ?? ""),
    amountCents: parseCents(String(formData.get("amount") ?? "")),
    method: method as PaymentMethodName,
    reference: String(formData.get("reference") ?? "").trim() || null,
    takenById: userId,
  });

  if (!result.ok) return formError(result.error);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${String(formData.get("invoiceId") ?? "")}`);
  // `settled` rides along so the dialog can offer to email a receipt the moment
  // the invoice clears. Additive: every other caller ignores it.
  return { ...formSuccess(), settled: result.settled };
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/**
 * Hand money back against an invoice.
 *
 * ---------------------------------------------------------------------------
 * PAYMENTS ARE APPEND-ONLY
 * ---------------------------------------------------------------------------
 * A refund NEVER deletes or edits a Payment row. The money came in, then some
 * of it went back out, and both are facts the till has to be able to show. That
 * is the whole reason `Refund` is its own table rather than a negative Payment:
 * "collected" and "returned" stay separately reportable, and no report has to
 * guess which negative rows were refunds.
 *
 * ---------------------------------------------------------------------------
 * THE CEILING
 * ---------------------------------------------------------------------------
 * Refundable = Σ payments − Σ existing refunds, computed inside the transaction
 * from freshly-read rows. Two front-desk staff refunding the same invoice at
 * the same moment must not both see the pre-refund ceiling. The invoice TOTAL
 * is deliberately not the ceiling: you can only give back what actually came
 * in, and on a partially-paid invoice that is less.
 *
 * ---------------------------------------------------------------------------
 * STATUS WALKS BACKWARDS
 * ---------------------------------------------------------------------------
 * Refunding out of a PAID invoice restates it — see `statusForNetPaid`. `paidAt`
 * is cleared whenever the invoice is no longer settled, so "Paid 3 Aug" cannot
 * survive on an invoice whose money has gone back to the customer.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF REFUND, AND THE DIALOG SAYS WHICH
 * ---------------------------------------------------------------------------
 *   TO CARD (STRIPE)   the selected payment was taken through Stripe, so this
 *                      calls the API and the money genuinely goes back. The
 *                      row is born "pending" and becomes "completed" the
 *                      moment Stripe says succeeded — synchronously if it
 *                      answers straight away, otherwise from the
 *                      `refund.updated` / `charge.refunded` webhook.
 *   MANUAL             cash out of the drawer, a cheque, store credit. The row
 *                      is born "completed" because the money moved when the
 *                      drawer opened, and Stripe is not involved at all.
 *
 * A Stripe refund the API refuses is marked "failed" and STOPS COUNTING (see
 * sumRefunds in components/billing/refund-math.ts): the attempt stays on the
 * record, but an invoice must never report money as returned when it was not.
 */
export async function refundInvoiceAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  // Refunds move money out of the shop. Front desk does it all day at the
  // counter; techs have no business doing it. OWNER included so the shop owner
  // is never locked out of their own till.
  const { shopId, userId, role } = await requireUser();
  if (role !== "OWNER" && role !== "FRONT_DESK") {
    return formError("Only an owner or front desk can issue a refund.");
  }

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, shopId },
    select: { id: true, customerId: true, status: true },
  });
  if (!invoice) return formError("That invoice no longer exists.");

  const method = String(formData.get("method") ?? "CARD").toUpperCase();
  if (!REFUND_METHODS.includes(method as RefundMethod)) {
    return formError("Pick a refund method.");
  }

  const amountCents = parseCents(String(formData.get("amount") ?? ""));
  if (amountCents <= 0) return formError("Enter an amount greater than zero.");

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  const requestedPaymentId =
    String(formData.get("paymentId") ?? "").trim() || null;
  // The dialog's radio choice. Only ever a request: the server still has to
  // find a Stripe PaymentIntent on the linked payment before it will call out.
  const wantsStripe = String(formData.get("viaStripe") ?? "") === "true";

  /**
   * Filled inside the transaction when this refund must go to Stripe.
   *
   * A box rather than a bare `let` because it is written from inside a
   * callback, and TypeScript's control-flow analysis cannot see that the
   * callback runs before the read below.
   */
  const pushToStripe: {
    value: { refundId: string; paymentIntentId: string } | null;
  } = { value: null };

  try {
    await db.$transaction(async (tx) => {
      // Re-read inside the transaction: the ceiling has to be computed from
      // what is true right now, not from what the page was rendered with.
      const [lines, payments, refunds, current] = await Promise.all([
        tx.invoiceLine.findMany({
          where: { invoiceId: invoice.id },
          select: { quantity: true, unitPriceCents: true, taxable: true },
        }),
        tx.payment.findMany({
          where: { invoiceId: invoice.id },
          select: {
            id: true,
            amountCents: true,
            method: true,
            stripePaymentIntentId: true,
          },
        }),
        tx.refund.findMany({
          where: { invoiceId: invoice.id },
          select: { amountCents: true, status: true },
        }),
        tx.invoice.findUniqueOrThrow({
          where: { id: invoice.id },
          select: { taxRateBps: true, status: true },
        }),
      ]);

      if (payments.length === 0) {
        throw new Error("Nothing has been collected on this invoice to refund.");
      }

      const totals = refundAwareTotals(
        lines,
        current.taxRateBps,
        payments,
        refunds
      );

      if (totals.refundableCents <= 0) {
        throw new Error(
          "Everything collected on this invoice has already been refunded."
        );
      }
      if (amountCents > totals.refundableCents) {
        throw new Error(
          `That is more than the ${formatCents(totals.refundableCents)} available to refund.`
        );
      }

      // An optional link to the specific payment being reversed. Validated
      // against THIS invoice's payments so a forged id cannot staple a refund
      // onto someone else's transaction.
      const linked =
        (requestedPaymentId &&
          payments.find((payment) => payment.id === requestedPaymentId)) ||
        null;
      const paymentId = linked?.id ?? null;

      // A Stripe reversal needs a card payment with a PaymentIntent behind it.
      // Refusing here rather than silently downgrading to a manual refund is
      // the point: staff who chose "Refund to card" must not walk away
      // believing money moved when it did not.
      const viaStripe =
        wantsStripe && method === "CARD" && Boolean(linked?.stripePaymentIntentId);
      if (wantsStripe && !viaStripe) {
        throw new Error(
          linked
            ? "That payment was not taken through Stripe, so it cannot be refunded to a card from here. Record it as a manual refund instead."
            : "Choose the Stripe payment you are reversing before refunding to a card.",
        );
      }

      const refund = await tx.refund.create({
        data: {
          shopId,
          invoiceId: invoice.id,
          paymentId,
          amountCents,
          method: method as RefundMethod,
          reason,
          refundedById: userId,
          // Pending until Stripe confirms. A manual refund is money that has
          // already left the drawer, so it is complete the moment it is typed.
          status: viaStripe ? "pending" : "completed",
        },
        select: { id: true },
      });

      if (viaStripe && linked?.stripePaymentIntentId) {
        // The API call happens AFTER this transaction commits: a network round
        // trip inside a Serializable transaction holds a lock open for however
        // long Stripe feels like taking.
        pushToStripe.value = {
          refundId: refund.id,
          paymentIntentId: linked.stripePaymentIntentId,
        };
      }

      // Refunding TO store credit is the shop keeping the cash and owing the
      // customer instead, so the balance moves and the CreditAdjustment ledger
      // records why — the same pairing customers/credit-actions.ts uses, in the
      // same transaction as the refund so neither can land without the other.
      if (method === "CREDIT") {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { creditBalanceCents: { increment: amountCents } },
        });
        await tx.creditAdjustment.create({
          data: {
            shopId,
            customerId: invoice.customerId,
            deltaCents: amountCents,
            reason: reason
              ? `Refund on invoice — ${reason}`
              : "Refund issued as store credit",
            userId,
          },
        });
      }

      // VOID stays VOID: a void invoice has no receivable to restate.
      if (current.status !== "VOID") {
        const netPaidAfter = totals.netPaidCents - amountCents;
        const nextStatus = statusForNetPaid(netPaidAfter, totals.totalCents);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: nextStatus,
            // Cleared the moment the invoice stops being settled — a "Paid on"
            // date must never outlive the money it refers to.
            paidAt: nextStatus === "PAID" ? undefined : null,
          },
        });
      }
    });
  } catch (error) {
    return formError(
      error instanceof Error ? error.message : "Could not record that refund."
    );
  }

  await audit({
    shopId,
    userId,
    action: "invoice.refunded",
    entity: "invoice",
    entityId: invoice.id,
    summary: `Refunded ${formatCents(amountCents)} on an invoice`,
    meta: { method, amountCents, reason },
  });

  // ------------------------------------------------------------- to Stripe
  // The row is already written, which is what makes this safe to retry: the
  // idempotency key is that row's id, so a second attempt returns the first
  // refund instead of sending the customer their money twice.
  let stripeProblem: string | null = null;
  const push = pushToStripe.value;
  if (push) {
    const sent = await createStripeRefund({
      shopId,
      refundId: push.refundId,
      paymentIntentId: push.paymentIntentId,
      amountCents,
      reason,
    });

    if (sent.ok) {
      // "pending" is normal — bank rails are slow, and `refund.updated` will
      // finish the row later. `markRefundStatus` re-derives the invoice status
      // from the rows either way, so both outcomes converge.
      await markRefundStatus({
        shopId,
        refundId: push.refundId,
        status: sent.status,
        stripeRefundId: sent.stripeRefundId,
      });
    } else {
      await markRefundStatus({
        shopId,
        refundId: push.refundId,
        status: "failed",
      });
      stripeProblem = sent.reason;
    }
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
  revalidatePath(`/customers/${invoice.customerId}`);

  if (stripeProblem) {
    return formError(
      `Stripe refused the refund: ${stripeProblem} It has been recorded as a failed attempt and the invoice is unchanged.`,
    );
  }
  return formSuccess();
}

// ---------------------------------------------------------------------------
// Card on file
// ---------------------------------------------------------------------------

/**
 * Charges the outstanding balance to the customer's saved card.
 *
 * The amount is NOT a parameter. It is recomputed inside
 * `chargeCardOnFile` from the invoice's own lines and payments, so a button
 * rendered before somebody keyed in a cash payment cannot bill the old,
 * larger balance.
 *
 * The Payment row is written here, synchronously, because the cashier is
 * standing there and needs to see the invoice go green. Stripe ALSO sends
 * `payment_intent.succeeded` moments later; both land in the same idempotent
 * settlement code (lib/payments/settle.ts) and exactly one Payment results.
 */
export async function chargeCardOnFileAction(
  invoiceId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { shopId, userId, role } = await requireUser();
  if (role !== "OWNER" && role !== "FRONT_DESK") {
    return { ok: false, error: "Only an owner or front desk can take a payment." };
  }

  const result = await chargeCardOnFile({
    shopId,
    invoiceId: String(invoiceId ?? ""),
    takenById: userId,
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  if (result.outcome.status === "error") {
    // Stripe took the money and the write failed. Say so plainly — the
    // webhook will settle it, but nobody should be told "done" meanwhile.
    return {
      ok: false,
      error:
        "The card was charged but the payment could not be filed. It will appear once Stripe's confirmation arrives.",
    };
  }
  if (result.outcome.status === "ignored") {
    return { ok: true, message: "That payment was already recorded." };
  }
  return {
    ok: true,
    message: `Charged ${formatCents(result.amountCents)} to the card on file.`,
  };
}

// ---------------------------------------------------------------------------
// Card reader (Stripe Terminal)
// ---------------------------------------------------------------------------

/**
 * Records a card-present payment the reader has already approved.
 *
 * THE BROWSER IS NOT A WITNESS. All it supplies is a PaymentIntent id;
 * `recordTerminalPayment` retrieves that intent from Stripe and refuses it
 * unless the status is succeeded AND its metadata names this invoice AND this
 * shop. Without those three checks a forged id would mark any invoice paid.
 */
export async function recordTerminalPaymentAction(
  invoiceId: string,
  paymentIntentId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { shopId, userId } = await requireUser();

  const result = await recordTerminalPayment({
    shopId,
    invoiceId: String(invoiceId ?? ""),
    paymentIntentId: String(paymentIntentId ?? ""),
    takenById: userId,
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  if (result.outcome.status === "ignored") {
    return { ok: true, message: "That payment was already recorded." };
  }
  return {
    ok: true,
    message: `Approved — ${formatCents(result.amountCents)} taken on the reader.`,
  };
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * One-click "mark sent + email the default message".
 *
 * SUPERSEDED by `sendInvoiceAction` (below), which is what the Send dialog
 * calls and what every UI surface now uses. This remains as the no-dialog
 * fallback — it is one form post with no client JavaScript — and delegates to
 * exactly the same delivery core, so the two paths cannot drift.
 */
export async function markInvoiceSentAction(formData: FormData): Promise<void> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const invoice = await loadInvoiceForSend(shopId, id);
  if (!invoice || invoice.status !== "DRAFT") return;

  const request = { id, subject: "", message: "", email: true, sms: false };
  // Same pre-flight as the dialog path: an unreachable customer must not leave
  // the invoice claiming it was sent.
  if (unreachableReason(invoice.customer, request)) return;

  await deliverInvoice(shopId, invoice, request);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  // Voiding erases a receivable, so it is an owner-level act.
  const { shopId, userId, role } = await requireUser();
  if (role !== "OWNER") return;

  const id = String(formData.get("id") ?? "");
  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      number: true,
      status: true,
      ticketId: true,
      _count: { select: { payments: true } },
    },
  });
  if (!invoice) return;
  // Money has changed hands — voiding would orphan the payment history.
  if (invoice._count.payments > 0) return;
  if (invoice.status === "VOID") return;

  // Voiding un-sells everything on it, so any serialized units go straight
  // back on the shelf with the level corrected in the same transaction.
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "VOID", paidAt: null },
    });
    // Voiding un-bills the labour too: the hours were worked, so they go back
    // to being unbilled time on the ticket rather than dying with the document.
    await tx.timeEntry.updateMany({
      where: { invoiceId: invoice.id, shopId },
      data: { invoiceId: null },
    });
    const released = await releaseInvoiceSerials(tx, {
      shopId,
      invoiceId: invoice.id,
    });
    if (released.length > 0) {
      await syncSerializedStock(tx, {
        shopId,
        userId,
        productIds: released.map((unit) => unit.productId),
        reason: `Returned to stock — invoice #${invoice.number} voided`,
      });
    }
  });

  await audit({
    shopId,
    userId,
    action: "invoice.voided",
    entity: "invoice",
    entityId: invoice.id,
    summary: `Voided invoice #${invoice.number}`,
  });

  await emitInvoiceEvent(shopId, "invoice.voided", invoice.id);

  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath(`/invoices/${invoice.id}`);
  if (invoice.ticketId) revalidatePath(`/tickets/${invoice.ticketId}`);
}

export async function saveInvoiceSignatureAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const signature = String(formData.get("signature") ?? "");
  if (!signature.startsWith("data:image/png;base64,")) {
    return formError("Capture a signature before saving.");
  }
  // A generous ceiling on a PNG of a scribble; keeps a hostile client from
  // stuffing megabytes into a text column.
  if (signature.length > 400_000) {
    return formError("That signature image is too large.");
  }

  const updated = await db.invoice.updateMany({
    where: { id, shopId },
    data: { signatureDataUrl: signature },
  });
  if (updated.count === 0) return formError("That invoice no longer exists.");

  revalidatePath(`/invoices/${id}`);
  return formSuccess();
}

// ---------------------------------------------------------------------------
// SENDING — email, SMS, or both, with a preview built from the real templates
// ---------------------------------------------------------------------------

/**
 * THE SEND SYSTEM
 * ---------------
 * `sendInvoiceAction` is the one way an invoice reaches a customer.
 *
 *   · Status first, delivery second. DRAFT → SENT is committed before a single
 *     byte leaves the building, so a mail provider having a bad afternoon can
 *     never un-send an invoice. lib/comms never throws for a delivery problem;
 *     it files the reason on the outbox row instead.
 *
 *   · Idempotent for resends. The transition only ever fires out of DRAFT. A
 *     second send of a PARTIAL invoice re-delivers the document and leaves the
 *     money alone — nothing about "we emailed it again" restates a balance.
 *
 *   · One CommunicationLog row per channel, written by lib/comms and nowhere
 *     else. Two channels means exactly two rows, including the ones that were
 *     skipped: "customer opted out" is history staff need, not silence.
 *
 *   · Every outcome comes back per channel, raw status included, so the UI can
 *     say WHY rather than showing a green tick over a skipped message.
 */

/** Everything the send/preview path reads. One query, scoped to the shop. */
async function loadInvoiceForSend(shopId: string, id: string) {
  return db.invoice.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      dueDate: true,
      taxRateBps: true,
      publicToken: true,
      customerId: true,
      ticketId: true,
      customer: {
        select: {
          firstName: true,
          email: true,
          mobile: true,
          emailOptIn: true,
          smsOptIn: true,
        },
      },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          amountCents: true,
          method: true,
          reference: true,
          createdAt: true,
        },
      },
      refunds: { select: { amountCents: true } },
      shop: { select: { name: true } },
    },
  });
}

type InvoiceForSend = NonNullable<Awaited<ReturnType<typeof loadInvoiceForSend>>>;

/** Deliberately permissive — the provider is the real validator. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PRE-FLIGHT: can any requested channel actually reach this customer?
 *
 * Marking a document SENT is a claim about the world. When every channel staff
 * picked is opted out or has no address, nothing is even attempted — and an
 * invoice sitting at SENT that no one ever received is a debt the shop will
 * chase and the customer will honestly deny.
 *
 * Checked BEFORE the status update rather than rolled back after it, so the
 * "status first, delivery second" ordering still holds for the real case: once
 * we know a message is going out, a provider outage can never un-send it.
 *
 * Returns the reasons when nothing is reachable, and null when at least one
 * channel can be tried. A provider that later fails is NOT this: that message
 * left the building and the failure is recorded on its outbox row.
 */
function unreachableReason(
  customer: {
    email: string | null;
    mobile: string | null;
    emailOptIn: boolean;
    smsOptIn: boolean;
  },
  input: SendRequest
): string | null {
  const reasons: string[] = [];

  if (input.email) {
    const address = (input.emailTo ?? "").trim() || customer.email;
    if (!customer.emailOptIn) reasons.push("this customer has opted out of email");
    else if (!address) reasons.push("there is no email address on file");
    else return null;
  }

  if (input.sms) {
    if (!customer.smsOptIn) reasons.push("this customer has opted out of SMS");
    else if (!customer.mobile?.trim()) reasons.push("there is no mobile number on file");
    else return null;
  }

  return `Nothing was sent — ${reasons.join(", and ")}.`;
}

/**
 * Composes the message and decides whether it may advertise online payment.
 *
 * The preview and the send path both call this, so "pay online" appears in the
 * preview exactly when it will appear in the customer's inbox. `payOnline` is
 * handed to lib/comms as `linkTargetsInvoice`, which can only ever raise the
 * flag for a link that already carries an invoiceId, and `paymentsLive()` is
 * still checked on the way through.
 */
function composeInvoiceMessage(invoice: InvoiceForSend, input: SendRequest) {
  const totals = refundAwareTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
    invoice.refunds
  );

  const message = invoiceMessage({
    shopName: invoice.shop.name,
    customerFirstName: invoice.customer.firstName,
    number: invoice.number,
    publicToken: invoice.publicToken,
    createdAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    lineCount: invoice.lines.length,
    totalCents: totals.totalCents,
    balanceCents: totals.balanceCents,
    message: input.message,
    subject: input.subject,
  });

  // Nothing owed, or a void invoice, means there is no payment to take — a
  // "Pay this invoice online" button that lands on a settled invoice is a
  // support call waiting to happen.
  const payOnline =
    paymentsLive() && invoice.status !== "VOID" && totals.balanceCents > 0;

  return { totals, message, payOnline };
}

/** Sends the requested channels and reports each one honestly. */
async function deliverInvoice(
  shopId: string,
  invoice: InvoiceForSend,
  input: SendRequest
): Promise<{ outcomes: SendChannelOutcome[]; statusChanged: boolean; status: string }> {
  const { message, payOnline } = composeInvoiceMessage(invoice, input);

  const outcomes: SendChannelOutcome[] = [];
  const emailTo = (input.emailTo ?? "").trim();

  if (input.email) {
    const result = await sendEmail({
      shopId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      ticketId: invoice.ticketId,
      to: emailTo || undefined,
      subject: message.subject,
      body: message.emailBody,
      summary: message.summary,
      context: message.context,
      portalPath: message.portalPath,
      linkTargetsInvoice: payOnline,
    });
    const to = emailTo || invoice.customer.email || "";
    outcomes.push({
      channel: "EMAIL",
      to,
      status: result.status,
      ...describeOutcome("EMAIL", to, result.status),
    });
  }

  if (input.sms) {
    const result = await sendSms({
      shopId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      ticketId: invoice.ticketId,
      body: message.smsBody,
      portalPath: message.portalPath,
    });
    const to = invoice.customer.mobile ?? "";
    outcomes.push({
      channel: "SMS",
      to,
      status: result.status,
      ...describeOutcome("SMS", to, result.status),
    });
  }

  // Only a delivery that actually left the shop earns SENT. A send where every
  // channel was skipped or failed leaves a DRAFT honestly a DRAFT — and a
  // resend of a SENT/PARTIAL/PAID invoice never walks its status backwards.
  const anyDelivered = outcomes.some(
    (o) => o.status === "sent" || o.status === "logged",
  );
  let status = invoice.status;
  let statusChanged = false;
  if (invoice.status === "DRAFT" && anyDelivered) {
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT" },
    });
    status = "SENT";
    statusChanged = true;
  }

  return { outcomes, statusChanged, status };
}

/**
 * Renders exactly what `sendInvoiceAction` would put on the wire.
 *
 * Same composer, same `renderEmail`/`renderSms`, same absolute link — the
 * preview pane is not a mock-up of the email, it is the email.
 */
export async function previewInvoiceSendAction(
  input: SendRequest
): Promise<SendPreviewState> {
  const { shopId } = await requireUser();

  const invoice = await loadInvoiceForSend(shopId, String(input.id ?? ""));
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };

  const { message, payOnline } = composeInvoiceMessage(invoice, input);

  const email = renderEmail({
    shopName: invoice.shop.name,
    subject: message.subject,
    body: message.emailBody,
    portalUrl: message.linkUrl,
    context: message.context,
    payOnline,
    summary: message.summary,
  });

  return {
    ok: true,
    preview: {
      subject: message.subject,
      emailHtml: email.html,
      emailText: email.text,
      smsText: renderSms({
        shopName: invoice.shop.name,
        body: message.smsBody,
        portalUrl: message.linkUrl,
      }),
      linkUrl: message.linkUrl,
      payOnline,
    },
  };
}

export async function sendInvoiceAction(
  input: SendRequest
): Promise<SendResultState> {
  const { shopId } = await requireUser();

  if (!input.email && !input.sms) {
    return { ok: false, error: "Pick at least one way to send this." };
  }

  const emailTo = (input.emailTo ?? "").trim();
  if (input.email && emailTo && !EMAIL_SHAPE.test(emailTo)) {
    return { ok: false, error: `"${emailTo}" is not a valid email address.` };
  }

  const invoice = await loadInvoiceForSend(shopId, String(input.id ?? ""));
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (invoice.status === "VOID") {
    return { ok: false, error: "This invoice is void — it cannot be sent." };
  }
  if (invoice.lines.length === 0) {
    return { ok: false, error: "Add line items before sending this invoice." };
  }

  const unreachable = unreachableReason(invoice.customer, input);
  if (unreachable) return { ok: false, error: unreachable };

  const result = await deliverInvoice(shopId, invoice, input);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
  revalidatePath(`/customers/${invoice.customerId}`);

  return { ok: true, ...result };
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

/**
 * A Stripe Checkout URL for whatever is still owed, for the clipboard.
 *
 * The session is opened against the SHOP's scope, so a forged invoice id from
 * another tenant finds nothing. Everything else — the amount, the idempotency
 * key, the refusal to charge a settled invoice — is lib/payments' business, and
 * its `reason` strings are already written for a human to read.
 */
export async function invoicePaymentLinkAction(
  invoiceId: string
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const { shopId } = await requireUser();

  if (!paymentsLive()) {
    return {
      ok: false,
      reason:
        "Online payments are not configured — add a Stripe secret key to enable them.",
    };
  }

  const result = await createInvoiceCheckout(String(invoiceId ?? ""), { shopId });
  return result.ok
    ? { ok: true, url: result.url }
    : { ok: false, reason: result.reason };
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

/**
 * Emails a receipt for the money already collected.
 *
 * Separate from the invoice email on purpose: a receipt must never carry a
 * "pay online" button, and it is addressed to a payment rather than to a
 * balance. It reports the LAST payment as the transaction, and the invoice's
 * refund-aware position as the standing.
 */
export async function emailInvoiceReceiptAction(
  invoiceId: string
): Promise<{ ok: boolean; message: string }> {
  const { shopId } = await requireUser();

  const invoice = await loadInvoiceForSend(shopId, String(invoiceId ?? ""));
  if (!invoice) return { ok: false, message: "That invoice no longer exists." };

  const last = invoice.payments[invoice.payments.length - 1];
  if (!last) {
    return {
      ok: false,
      message: "Nothing has been collected on this invoice yet.",
    };
  }

  const totals = refundAwareTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
    invoice.refunds
  );

  const message = receiptMessage({
    shopName: invoice.shop.name,
    customerFirstName: invoice.customer.firstName,
    number: invoice.number,
    publicToken: invoice.publicToken,
    paidAt: last.createdAt,
    method: RECEIPT_METHOD_LABELS[last.method] ?? last.method,
    amountCents: last.amountCents,
    netPaidCents: totals.netPaidCents,
    totalCents: totals.totalCents,
    balanceCents: totals.balanceCents,
  });

  const result = await sendEmail({
    shopId,
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    ticketId: invoice.ticketId,
    subject: message.subject,
    body: message.emailBody,
    summary: message.summary,
    context: message.context,
    portalPath: message.portalPath,
    // No pay button on a receipt, whatever the environment says.
    linkTargetsInvoice: false,
  });

  revalidatePath(`/invoices/${invoice.id}`);
  revalidatePath(`/customers/${invoice.customerId}`);

  const to = invoice.customer.email ?? "";
  const described = describeOutcome("EMAIL", to, result.status);
  return { ok: described.ok, message: described.message };
}

/**
 * Method labels for the receipt. Duplicated from the detail page rather than
 * shared, because a `"use server"` module may only export async functions and
 * a five-line record is not worth a module of its own.
 */
const RECEIPT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};
