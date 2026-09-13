/**
 * Card on file.
 *
 * WHAT IS ACTUALLY STORED HERE
 * ---------------------------
 * A Stripe customer id, a payment method id, and four display fields — brand,
 * last four, expiry month and year. That is it. The card number, CVC and the
 * full expiry never touch this server, because the card is captured on
 * Stripe's own hosted page in `mode=setup`, exactly like ./checkout.ts does
 * for a one-off payment. RepairPilot stays at PCI DSS SAQ A and there is still
 * no card input anywhere in this codebase.
 *
 * THE TWO HALVES
 * --------------
 *   SAVING     a Checkout Session in setup mode. The card lands on Stripe;
 *              the webhook (checkout.session.completed, mode=setup) reads the
 *              SetupIntent back and stores the four display fields.
 *   CHARGING   an off-session PaymentIntent with `confirm=true`. There is no
 *              customer at a browser to complete a 3-D Secure challenge, so a
 *              card that demands one comes back as a decline with a reason
 *              staff can read out over the phone, not a silent failure.
 *
 * Every call carries the shop's connected account when it has one, so the
 * customer, the saved card and the charge all live in the same Stripe account
 * — a payment method saved on the platform cannot be charged on a connected
 * account, and vice versa.
 */

import { appUrl } from "@/lib/comms/config";
import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";

import { currencySupported, paymentsCurrency, paymentsLive } from "./config";
import { accountFor } from "./account";
import { settleStripePayment, type SettleOutcome } from "./settle";
import { chargeIdOf, stripeFetch, type StripePaymentIntent } from "./stripe";

/** Stripe refuses a card payment below this in a two-decimal currency. */
const MIN_CHARGE_CENTS = 50;

export type CardOnFile = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

/** The saved card as the UI needs it, or null when there is none. */
export function cardOnFile(customer: {
  stripePaymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
}): CardOnFile | null {
  if (!customer.stripePaymentMethodId || !customer.cardLast4) return null;
  return {
    brand: customer.cardBrand ?? "card",
    last4: customer.cardLast4,
    expMonth: customer.cardExpMonth ?? 0,
    expYear: customer.cardExpYear ?? 0,
  };
}

/** True once the printed expiry has passed. Stripe will decline it anyway. */
export function cardExpired(card: CardOnFile, now = new Date()): boolean {
  if (!card.expYear || !card.expMonth) return false;
  const endOfMonth = new Date(Date.UTC(card.expYear, card.expMonth, 1));
  return now.getTime() >= endOfMonth.getTime();
}

// ---------------------------------------------------------------------------
// Saving a card
// ---------------------------------------------------------------------------

/**
 * Returns the shop's Stripe customer id for this customer, creating it once.
 *
 * The lookup is scoped by shopId, so a forged customer id from another tenant
 * finds nothing. The id is written back immediately: a Stripe customer created
 * but not recorded is an orphan nobody will ever find again.
 */
export async function ensureStripeCustomer(
  shopId: string,
  customerId: string,
): Promise<{ ok: true; stripeCustomerId: string } | { ok: false; reason: string }> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      businessName: true,
      email: true,
      phone: true,
      mobile: true,
      stripeCustomerId: true,
    },
  });
  if (!customer) return { ok: false, reason: "That customer no longer exists." };
  if (customer.stripeCustomerId) {
    return { ok: true, stripeCustomerId: customer.stripeCustomerId };
  }

  const account = await accountFor(shopId);
  const name =
    customer.businessName?.trim() ||
    `${customer.firstName} ${customer.lastName}`.trim();

  const created = await stripeFetch<{ id?: string }>("/v1/customers", {
    method: "POST",
    account,
    // Derived from the pair we just verified, so a retry after a timeout
    // re-uses the same Stripe customer instead of minting a second one.
    idempotencyKey: `shop-${shopId}-customer-${customer.id}`,
    body: {
      name,
      email: customer.email ?? undefined,
      phone: customer.mobile ?? customer.phone ?? undefined,
      metadata: { shopId, customerId: customer.id },
    },
  });

  if (!created.ok || !created.data.id) {
    return {
      ok: false,
      reason: created.ok ? "Stripe did not return a customer." : created.message,
    };
  }

  await db.customer.updateMany({
    where: { id: customer.id, shopId },
    data: { stripeCustomerId: created.data.id },
  });

  return { ok: true, stripeCustomerId: created.data.id };
}

/**
 * Opens the hosted page that captures a card without charging it.
 *
 * `setup_future_usage` is implied by setup mode; what matters here is
 * `payment_method_types=card` and the metadata, which is how the webhook finds
 * its way back to the right customer in the right shop.
 */
export async function createCardSetupCheckout(
  shopId: string,
  customerId: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const stripeCustomer = await ensureStripeCustomer(shopId, customerId);
  if (!stripeCustomer.ok) return stripeCustomer;

  const account = await accountFor(shopId);
  const back = `${appUrl()}/customers/${customerId}`;

  const session = await stripeFetch<{ url?: string }>("/v1/checkout/sessions", {
    method: "POST",
    account,
    body: {
      mode: "setup",
      customer: stripeCustomer.stripeCustomerId,
      payment_method_types: ["card"],
      // `flash` is the param the customer page already uses for one-shot
      // toasts, so there is nothing new to teach it.
      success_url: `${back}?flash=card-saved`,
      cancel_url: `${back}?flash=card-canceled`,
      metadata: { shopId, customerId },
    },
  });

  if (!session.ok || !session.data.url) {
    return {
      ok: false,
      reason: session.ok
        ? "Stripe did not return a setup page."
        : session.message,
    };
  }
  return { ok: true, url: session.data.url };
}

type SetupIntent = {
  id: string;
  status?: string;
  payment_method?: string | { id?: string } | null;
};

type PaymentMethod = {
  id: string;
  card?: {
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
  } | null;
};

/**
 * Reads a finished SetupIntent back and stores the card's display fields.
 *
 * Called from the webhook, so everything it is given arrived over the wire:
 * the SetupIntent is fetched from Stripe rather than trusted from the payload,
 * and the customer is written with an `updateMany` scoped by shopId.
 */
export async function storeCardFromSetupIntent(input: {
  shopId: string;
  customerId: string;
  setupIntentId: string;
}): Promise<{ ok: true; card: CardOnFile } | { ok: false; reason: string }> {
  const account = await accountFor(input.shopId);

  const intent = await stripeFetch<SetupIntent>(
    `/v1/setup_intents/${encodeURIComponent(input.setupIntentId)}`,
    { account },
  );
  if (!intent.ok) return { ok: false, reason: intent.message };
  if (intent.data.status !== "succeeded") {
    return { ok: false, reason: `setup intent status ${intent.data.status}` };
  }

  const raw = intent.data.payment_method;
  const paymentMethodId = typeof raw === "string" ? raw : (raw?.id ?? null);
  if (!paymentMethodId) {
    return { ok: false, reason: "setup intent has no payment method" };
  }

  const method = await stripeFetch<PaymentMethod>(
    `/v1/payment_methods/${encodeURIComponent(paymentMethodId)}`,
    { account },
  );
  if (!method.ok) return { ok: false, reason: method.message };

  const card = method.data.card;
  if (!card?.last4) return { ok: false, reason: "payment method is not a card" };

  const updated = await db.customer.updateMany({
    where: { id: input.customerId, shopId: input.shopId },
    data: {
      stripePaymentMethodId: paymentMethodId,
      cardBrand: card.brand ?? "card",
      cardLast4: card.last4,
      cardExpMonth: card.exp_month ?? null,
      cardExpYear: card.exp_year ?? null,
    },
  });
  if (updated.count === 0) {
    return { ok: false, reason: "customer not found for that shop" };
  }

  return {
    ok: true,
    card: {
      brand: card.brand ?? "card",
      last4: card.last4,
      expMonth: card.exp_month ?? 0,
      expYear: card.exp_year ?? 0,
    },
  };
}

/**
 * Detaches the card at Stripe and forgets it here.
 *
 * The local fields are cleared even if the detach fails — same reasoning as
 * disconnecting a Connect account. A shop that pressed "Remove card" must not
 * be left with a card it believes it deleted still sitting on the invoice
 * screen, and a detached-but-remembered method would decline anyway.
 */
export async function removeCardOnFile(
  shopId: string,
  customerId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: { id: true, stripePaymentMethodId: true },
  });
  if (!customer) return { ok: false, reason: "That customer no longer exists." };

  let reason: string | null = null;
  if (customer.stripePaymentMethodId) {
    const account = await accountFor(shopId);
    const detached = await stripeFetch(
      `/v1/payment_methods/${encodeURIComponent(customer.stripePaymentMethodId)}/detach`,
      { method: "POST", account, body: {} },
    );
    if (!detached.ok) reason = detached.message;
  }

  await db.customer.updateMany({
    where: { id: customer.id, shopId },
    data: {
      stripePaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
    },
  });

  return reason ? { ok: false, reason } : { ok: true };
}

// ---------------------------------------------------------------------------
// Charging the card on file
// ---------------------------------------------------------------------------

export type ChargeResult =
  | { ok: true; outcome: SettleOutcome; amountCents: number; paymentIntentId: string }
  | { ok: false; reason: string };

/**
 * Charges an invoice's outstanding balance to the customer's saved card.
 *
 * THE AMOUNT IS NEVER THE CALLER'S. It is recomputed from the invoice's own
 * lines and payments here, so a stale button on a page rendered ten minutes
 * ago cannot bill last week's balance. That recomputed figure is also part of
 * the idempotency key, which is what makes a double-click one charge and a
 * genuinely-changed balance a genuinely new operation.
 *
 * A decline comes back as a sentence: `last_payment_error.message` is written
 * by Stripe for a human, and "your card was declined" read out to a customer
 * is worth more than a code nobody at the counter can act on.
 */
export async function chargeCardOnFile(input: {
  shopId: string;
  invoiceId: string;
  /** The cashier who pressed the button, when there was one. */
  takenById?: string | null;
}): Promise<ChargeResult> {
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
    where: { id: input.invoiceId, shopId: input.shopId },
    select: {
      id: true,
      status: true,
      taxRateBps: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
      customer: {
        select: {
          id: true,
          stripeCustomerId: true,
          stripePaymentMethodId: true,
          cardLast4: true,
        },
      },
    },
  });
  if (!invoice) return { ok: false, reason: "That invoice no longer exists." };
  if (invoice.status === "VOID") {
    return { ok: false, reason: "This invoice is void — it cannot take payments." };
  }
  if (!invoice.customer.stripeCustomerId || !invoice.customer.stripePaymentMethodId) {
    return { ok: false, reason: "This customer has no card on file." };
  }

  const totals = invoiceTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
  );
  if (totals.balanceCents <= 0) {
    return { ok: false, reason: "There is nothing left to pay on this invoice." };
  }
  if (totals.balanceCents < MIN_CHARGE_CENTS) {
    return {
      ok: false,
      reason: "The balance is below the minimum a card payment can process.",
    };
  }

  const account = await accountFor(input.shopId);

  const intent = await stripeFetch<StripePaymentIntent>("/v1/payment_intents", {
    method: "POST",
    account,
    idempotencyKey: `invoice-${invoice.id}-cof-${totals.balanceCents}`,
    body: {
      amount: totals.balanceCents,
      currency,
      customer: invoice.customer.stripeCustomerId,
      payment_method: invoice.customer.stripePaymentMethodId,
      // Nobody is at a browser. Stripe uses this to pick the right network
      // flags and to fail fast rather than parking the charge on a challenge
      // page no one will ever see.
      off_session: true,
      confirm: true,
      metadata: {
        invoiceId: invoice.id,
        shopId: input.shopId,
        source: "card_on_file",
      },
    },
  });

  if (!intent.ok) {
    return { ok: false, reason: intent.message };
  }

  const data = intent.data;
  if (data.status !== "succeeded") {
    const detail =
      data.last_payment_error?.message ??
      (data.status === "requires_action"
        ? "The bank wants the customer to confirm this payment in person — send them a payment link instead."
        : `Stripe left the payment at "${data.status}".`);
    return { ok: false, reason: detail };
  }

  const outcome = await settleStripePayment({
    shopId: input.shopId,
    invoiceId: invoice.id,
    amountCents: Math.round(Number(data.amount_received ?? data.amount ?? 0)) ||
      totals.balanceCents,
    reference: data.id,
    paymentIntentId: data.id,
    chargeId: chargeIdOf(data),
    source: "card_on_file",
    takenById: input.takenById ?? null,
  });

  return {
    ok: true,
    outcome,
    amountCents: totals.balanceCents,
    paymentIntentId: data.id,
  };
}
