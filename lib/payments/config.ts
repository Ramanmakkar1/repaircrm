/**
 * Online payment configuration.
 *
 * Mirrors lib/comms/config.ts on purpose: the driver is chosen entirely by
 * environment, so the same call site works on a laptop (no keys — the feature
 * is simply absent) and in production (Stripe) with no code change.
 *
 *   PAYMENTS_DRIVER    = off | stripe   default: stripe iff STRIPE_SECRET_KEY
 *   STRIPE_SECRET_KEY  = sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET = whsec_…     (webhook route only)
 *   PAYMENTS_CURRENCY  = usd            ISO 4217, lowercase
 *
 * FAIL CLOSED. An unrecognised PAYMENTS_DRIVER resolves to "off", never to
 * "stripe" — a typo in a deploy must remove a payment button, never point one
 * at a half-configured processor. Same reasoning as the log-by-default email
 * driver next door, with more money at stake.
 */

export type PaymentsDriverName = "off" | "stripe";

/**
 * What the environment ASKED for.
 *
 * Unset means "on if the key is there", which is what makes adding
 * STRIPE_SECRET_KEY the single switch that turns the feature on. An explicit
 * value always wins, so a shop can hold a key in env and still keep payments
 * off with PAYMENTS_DRIVER=off.
 */
export function paymentsDriverName(): PaymentsDriverName {
  const raw = process.env.PAYMENTS_DRIVER?.trim().toLowerCase();
  if (raw === "stripe") return "stripe";
  if (raw === "off") return "off";
  if (raw) return "off"; // typo — fail closed
  return stripeSecretKey() ? "stripe" : "off";
}

export function stripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

/**
 * The only question the UI should ever ask.
 *
 * "Driver is stripe" is an intention; "live" is the intention PLUS the key it
 * needs. A button rendered on intention alone is a button that 500s, so the
 * portal checks this and nothing else.
 */
export function paymentsLive(): boolean {
  return paymentsDriverName() === "stripe" && Boolean(stripeSecretKey());
}

/** The webhook can only be trusted once its own secret exists. */
export function webhookReady(): boolean {
  return paymentsLive() && Boolean(stripeWebhookSecret());
}

/**
 * Currencies whose smallest unit is the unit itself (¥1 is one JPY, not 100).
 * Stripe expects amounts already expressed in that unit.
 */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Currencies Stripe expects in thousandths, rounded to the nearest 10. */
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function paymentsCurrency(): string {
  const raw = process.env.PAYMENTS_CURRENCY?.trim().toLowerCase();
  return raw && /^[a-z]{3}$/.test(raw) ? raw : "usd";
}

/**
 * RepairFlow stores every amount as an integer number of CENTS — one
 * hundredth of the unit, everywhere, by schema invariant. That maps 1:1 onto
 * Stripe's minor units only for two-decimal currencies.
 *
 * Rather than quietly dividing by 100 (and rounding real money away) for JPY,
 * or multiplying by 10 for KWD, an exotic currency is refused outright. A
 * refused checkout is a support ticket; a silently 100×-wrong charge is a
 * chargeback and a bad afternoon.
 */
export function currencySupported(currency: string): boolean {
  const code = currency.toLowerCase();
  return !ZERO_DECIMAL.has(code) && !THREE_DECIMAL.has(code);
}
