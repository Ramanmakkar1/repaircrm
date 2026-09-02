/**
 * Card payments — online, on file, and at the counter.
 *
 * THE FOUR WAYS MONEY ARRIVES
 * ---------------------------
 *   createInvoiceCheckout()   a hosted Stripe page the customer pays on
 *   chargeCardOnFile()        an off-session charge to a saved card
 *   recordTerminalPayment()   a card presented to a reader at the counter
 *   applyCheckoutSession()    /
 *   applyPaymentIntent()      \ the webhook, confirming any of the above
 *
 * All four end in `settleStripePayment()` (./settle.ts), which is the only
 * code that writes a `Payment` row from a card and the only reason it is safe
 * for a Server Action and a webhook to record the same money at the same time.
 *
 * WHOSE ACCOUNT
 * -------------
 * A shop that onboarded through Connect (./connect.ts) has every call made on
 * ITS Stripe account via the `Stripe-Account` header. A shop that has not is
 * unchanged: platform key, direct mode, exactly as before.
 *
 * Card data never reaches this server (SAQ A — see ./checkout.ts), amounts are
 * integer cents end to end, and no id that arrived over the wire is believed
 * without being re-read from Stripe or the database first.
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
  encodeForm,
  stripeApiBase,
  stripeClientId,
  stripeConnectBase,
  stripeFetch,
  stripeTestMode,
  STRIPE_API_VERSION,
  type StripeResult,
} from "./stripe";

export { accountFor } from "./account";

export {
  clearConnection,
  clearConnectionByAccount,
  connectAuthorizeUrl,
  connectConfigured,
  connectRedirectUri,
  connectStatus,
  disconnectShop,
  exchangeConnectCode,
  saveConnection,
  signConnectState,
  verifyConnectState,
  type ConnectStatus,
} from "./connect";

export {
  buildCheckoutParams,
  checkoutIdempotencyKey,
  createInvoiceCheckout,
  type CheckoutParamsInput,
  type CheckoutResult,
} from "./checkout";

export {
  settleStripePayment,
  type SettleOutcome,
  type StripeSource,
} from "./settle";

export {
  applyCheckoutSession,
  applyPaymentIntent,
  idOf,
  signPayload,
  verifyStripeSignature,
  SIGNATURE_TOLERANCE_SECONDS,
  type ApplyOutcome,
  type CheckoutSessionEvent,
  type PaymentIntentEvent,
  type SignatureResult,
} from "./webhook";

export {
  cardExpired,
  cardOnFile,
  chargeCardOnFile,
  createCardSetupCheckout,
  ensureStripeCustomer,
  removeCardOnFile,
  storeCardFromSetupIntent,
  type CardOnFile,
} from "./card-on-file";

export {
  createConnectionToken,
  createPosTerminalIntent,
  createTerminalIntent,
  ensureTerminalLocation,
  listReaders,
  readTerminalLocationId,
  recordTerminalPayment,
  registerReader,
  verifyPosTerminalIntent,
  type TerminalIntent,
  type TerminalReader,
} from "./terminal";

export {
  applyChargeRefunded,
  applyRefundEvent,
  createStripeRefund,
  markRefundStatus,
  restateInvoiceForRefunds,
  type RefundStatus,
} from "./refunds";

/**
 * True when a Stripe payment landed against this invoice.
 *
 * Kept reference-based rather than switched to `stripeSource` so payments
 * recorded before Wave 8 — which have a `cs_…` reference and no source — are
 * still recognised as online card payments.
 */
export function isStripeReference(reference: string | null | undefined): boolean {
  return Boolean(reference?.startsWith("cs_") || reference?.startsWith("pi_"));
}
