/**
 * Outbound messaging configuration.
 *
 * Drivers are chosen entirely by environment, so the same call site works in
 * development (everything printed to the console + written to the outbox) and
 * in production (a real provider) with no code change:
 *
 *   EMAIL_DRIVER = log | resend      RESEND_API_KEY, EMAIL_FROM
 *   SMS_DRIVER   = log | twilio      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *                                    TWILIO_FROM
 *                | android_gateway   SMS_GATEWAY_URL, SMS_GATEWAY_USER,
 *                                    SMS_GATEWAY_PASSWORD
 *
 * `android_gateway` is the open-source "SMS Gateway for Android" (Apache-2.0,
 * github.com/capcom6/android-sms-gateway): an app on an Android phone turns that
 * phone's own SIM into the sender. No per-message fee, no carrier registration,
 * and customers see — and reply to — the shop's real number. It is for the
 * one-at-a-time messages a repair shop sends ("your phone is ready"), NOT for
 * marketing blasts: the project itself warns that carriers restrict bulk sending
 * from a handset.
 *
 * Unset (or unrecognised) falls back to "log" — the safe default: a misconfigured
 * deploy prints messages instead of silently dropping them or, worse, blasting
 * real customers from a staging box.
 */

export type EmailDriverName = "log" | "resend";
export type SmsDriverName = "log" | "twilio" | "android_gateway";

export function emailDriverName(): EmailDriverName {
  return process.env.EMAIL_DRIVER?.trim().toLowerCase() === "resend"
    ? "resend"
    : "log";
}

export function smsDriverName(): SmsDriverName {
  const raw = process.env.SMS_DRIVER?.trim().toLowerCase();
  return raw === "twilio" || raw === "android_gateway" ? raw : "log";
}

/**
 * Absolute origin used to build customer-facing links.
 * Trailing slashes are stripped so `${appUrl()}/portal` never doubles up.
 */
export function appUrl(): string {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3020";
  return raw.replace(/\/+$/, "");
}

/** Absolute URL for a portal path (`/portal`, `/portal/invoices/abc`, …). */
export function portalUrl(path: string = "/portal"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${appUrl()}${suffix}`;
}

/**
 * FRICTIONLESS DOCUMENT LINKS
 * ---------------------------
 * `/portal/invoices/<id>` demands a portal session, so a customer who taps it
 * from an email lands on a sign-in form and has to fetch a second email to read
 * the first one. These two short paths are the fix: they carry the document's
 * own unguessable `publicToken`, and the route handler behind them mints the
 * portal cookie for that document's customer before redirecting to the real
 * page (see app/portal/i/[token]/route.ts).
 *
 * They are deliberately SHORT — `/portal/i/` rather than `/portal/invoices/` —
 * because the same URL goes into an SMS, where every character is billable.
 *
 * SECURITY / LIFETIME: a publicToken does not expire (it is per-document, and
 * the schema has no expiry column for it). Anyone holding the link holds
 * read access to that customer's portal until the document is deleted. That is
 * the same bargain every "view your invoice" link in the industry makes, and
 * the token is a cuid the customer never has to type — but it is why these
 * links belong in an email to the customer and nowhere else.
 */
export function invoiceTokenPath(publicToken: string): string {
  return `/portal/i/${encodeURIComponent(publicToken)}`;
}

export function estimateTokenPath(publicToken: string): string {
  return `/portal/e/${encodeURIComponent(publicToken)}`;
}
