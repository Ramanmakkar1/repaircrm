/**
 * Stripe Checkout Session creation.
 *
 * WHY A HOSTED CHECKOUT AND NOTHING ELSE
 * --------------------------------------
 * The customer's card number goes from their browser to Stripe's own page and
 * never touches this server, this database or these logs. That is the whole
 * design: it keeps RepairPilot at PCI DSS SAQ A — the smallest scope there is —
 * instead of dragging a repair shop into a full audit because someone wanted a
 * prettier form. There is no card field anywhere in this codebase, on purpose.
 *
 * No SDK: one form-encoded `fetch` against a documented REST endpoint, exactly
 * like lib/comms/drivers.ts. Nothing to keep in sync with a dependency tree.
 *
 * WHAT THIS FUNCTION DOES NOT DO
 * ------------------------------
 * It does not mark anything paid. Creating a session means the customer was
 * shown a payment page, which is not money. The invoice moves only when the
 * webhook says Stripe took the money (see ./webhook.ts). A customer who closes
 * the tab on the confirmation screen is still paid; a customer who reaches the
 * success page after a card decline is not.
 */

import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
import { appUrl } from "@/lib/comms/config";

import { accountFor } from "./account";
import { stripeFetch } from "./stripe";
import {
  currencySupported,
  paymentsCurrency,
  paymentsLive,
} from "./config";

export type CheckoutResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; reason: string };

/** Statuses that can legitimately be paid online. */
const PAYABLE = new Set(["SENT", "PARTIAL"]);

export type CheckoutParamsInput = {
  invoiceId: string;
  shopId: string;
  shopName: string;
  invoiceNumber: number;
  /** What is actually still owed, in cents. Never the invoice total. */
  balanceCents: number;
  currency: string;
  /** Unguessable per-invoice token — Stripe's `client_reference_id`. */
  publicToken: string;
  /** Origin for the return URLs. */
  origin: string;
  customerEmail?: string | null;
};

/**
 * The request body, as a pure function.
 *
 * Split out from the network call so the interesting half — "does the customer
 * get charged the right number of cents?" — is testable without a Stripe key,
 * a fixture server, or a prayer.
 */
export function buildCheckoutParams(input: CheckoutParamsInput): URLSearchParams {
  const params = new URLSearchParams();

  params.set("mode", "payment");

  // One line item for the outstanding balance. Restating every invoice line on
  // Stripe's page would be a second source of truth for the amount owed, and
  // the first one to drift is the one the customer pays.
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", input.currency);
  params.set(
    "line_items[0][price_data][unit_amount]",
    String(input.balanceCents),
  );
  params.set(
    "line_items[0][price_data][product_data][name]",
    `Invoice #${input.invoiceNumber} — ${input.shopName}`,
  );

  // The webhook reads these back to find the invoice. `shopId` travels with the
  // event so the handler can scope its lookup to one tenant instead of trusting
  // an id on its own — the same rule every query in the app follows.
  params.set("metadata[invoiceId]", input.invoiceId);
  params.set("metadata[shopId]", input.shopId);

  // Repeated onto the PaymentIntent: a payout reconciliation walks balance
  // transactions, which reference the intent, not the session. Metadata that
  // only exists on the session is metadata you cannot see at month end.
  params.set("payment_intent_data[metadata][invoiceId]", input.invoiceId);
  params.set("payment_intent_data[metadata][shopId]", input.shopId);
  // Tells `payment_intent.succeeded` which of the three card journeys this
  // was, so a payment recorded from that event alone still reports honestly on
  // the invoice instead of guessing.
  params.set("payment_intent_data[metadata][source]", "checkout");

  params.set("client_reference_id", input.publicToken);

  if (input.customerEmail) {
    params.set("customer_email", input.customerEmail);
  }

  const base = `${input.origin}/portal/invoices/${input.invoiceId}`;
  params.set("success_url", `${base}?paid=1`);
  params.set("cancel_url", `${base}?canceled=1`);

  return params;
}

/**
 * Idempotency key, derived from the business operation rather than the request.
 *
 * Double-click, a browser retry and an impatient refresh all resolve to the
 * same key, so Stripe replays the first session instead of opening a second
 * payment page for the same money. The balance is part of the key: once a
 * payment lands the operation is genuinely different, and the customer must be
 * shown the new, smaller amount.
 */
export function checkoutIdempotencyKey(
  invoiceId: string,
  balanceCents: number,
): string {
  return `invoice-${invoiceId}-balance-${balanceCents}`;
}

/**
 * Opens a Checkout Session for whatever is still owed on an invoice.
 *
 * `scope` is the caller's tenant pair. The portal passes its session's
 * `{ shopId, customerId }` so a guessed invoice id from another shop 404s here
 * rather than quietly billing the wrong person's work.
 */
export async function createInvoiceCheckout(
  invoiceId: string,
  scope?: { shopId?: string; customerId?: string },
): Promise<CheckoutResult> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const currency = paymentsCurrency();
  if (!currencySupported(currency)) {
    return {
      ok: false,
      reason: `PAYMENTS_CURRENCY=${currency} is not a two-decimal currency; RepairPilot stores amounts in cents.`,
    };
  }

  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(scope?.shopId ? { shopId: scope.shopId } : {}),
      ...(scope?.customerId ? { customerId: scope.customerId } : {}),
    },
    select: {
      id: true,
      shopId: true,
      number: true,
      status: true,
      taxRateBps: true,
      publicToken: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
      customer: { select: { email: true } },
      shop: { select: { name: true } },
    },
  });
  if (!invoice) return { ok: false, reason: "That invoice no longer exists." };

  if (!PAYABLE.has(invoice.status)) {
    // DRAFT is not something the customer has been shown; PAID and VOID are
    // terminal. None of them may take money.
    return {
      ok: false,
      reason:
        invoice.status === "PAID"
          ? "This invoice is already paid."
          : invoice.status === "VOID"
            ? "This invoice has been voided."
            : "This invoice has not been issued yet.",
    };
  }

  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  if (totals.balanceCents <= 0) {
    return { ok: false, reason: "There is nothing left to pay on this invoice." };
  }
  // Stripe's floor. Below it there is no card payment to be had at any price.
  if (totals.balanceCents < 50) {
    return {
      ok: false,
      reason: "The balance is below the minimum a card payment can process.",
    };
  }

  const params = buildCheckoutParams({
    invoiceId: invoice.id,
    shopId: invoice.shopId,
    shopName: invoice.shop.name,
    invoiceNumber: invoice.number,
    balanceCents: totals.balanceCents,
    currency,
    publicToken: invoice.publicToken,
    origin: appUrl(),
    customerEmail: invoice.customer.email,
  });

  // Connected shops charge on their own account; everyone else stays in direct
  // mode on the platform key, exactly as before Connect existed.
  const account = await accountFor(invoice.shopId);

  const result = await stripeFetch<{ id?: string; url?: string }>(
    "/v1/checkout/sessions",
    {
      method: "POST",
      body: Object.fromEntries(params),
      account,
      idempotencyKey: checkoutIdempotencyKey(invoice.id, totals.balanceCents),
    },
  );

  if (!result.ok || !result.data.url || !result.data.id) {
    const detail = result.ok ? "no session url" : result.message;
    console.error("[payments] checkout session failed:", detail);
    // The customer is told something neutral; the operator gets the detail in
    // the log. A processor's error string is not a customer-facing sentence.
    return {
      ok: false,
      reason: "Card payments are unavailable right now. Please try again.",
    };
  }

  return { ok: true, url: result.data.url, sessionId: result.data.id };
}
