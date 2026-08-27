/**
 * Online card payments.
 *
 * ONE WAY IN, ONE WAY OUT
 * -----------------------
 *   createInvoiceCheckout()   opens a hosted Stripe page for an invoice balance
 *   applyCheckoutSession()    records the money once Stripe confirms it
 *
 * Nothing else in the app talks to a processor, and nothing else marks an
 * invoice paid from a card. Card data never reaches this server (SAQ A — see
 * ./checkout.ts), amounts are integer cents end to end, and the webhook is the
 * only thing trusted to say a payment happened.
 */

export {
  paymentsDriverName,
  paymentsLive,
  paymentsCurrency,
  currencySupported,
  webhookReady,
  stripeSecretKey,
  stripeWebhookSecret,
  type PaymentsDriverName,
} from "./config";

export {
  buildCheckoutParams,
  checkoutIdempotencyKey,
  createInvoiceCheckout,
  type CheckoutParamsInput,
  type CheckoutResult,
} from "./checkout";

export {
  applyCheckoutSession,
  signPayload,
  verifyStripeSignature,
  SIGNATURE_TOLERANCE_SECONDS,
  type ApplyOutcome,
  type CheckoutSessionEvent,
  type SignatureResult,
} from "./webhook";

/** True when a Stripe payment landed against this invoice. */
export function isStripeReference(reference: string | null | undefined): boolean {
  return Boolean(reference?.startsWith("cs_"));
}
