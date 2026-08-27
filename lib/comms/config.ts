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
 *
 * Unset (or unrecognised) falls back to "log" — the safe default: a misconfigured
 * deploy prints messages instead of silently dropping them or, worse, blasting
 * real customers from a staging box.
 */

export type EmailDriverName = "log" | "resend";
export type SmsDriverName = "log" | "twilio";

export function emailDriverName(): EmailDriverName {
  return process.env.EMAIL_DRIVER?.trim().toLowerCase() === "resend"
    ? "resend"
    : "log";
}

export function smsDriverName(): SmsDriverName {
  return process.env.SMS_DRIVER?.trim().toLowerCase() === "twilio"
    ? "twilio"
    : "log";
}

/**
 * Absolute origin used to build customer-facing links.
 * Trailing slashes are stripped so `${appUrl()}/portal` never doubles up.
 */
export function appUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3020";
  return raw.replace(/\/+$/, "");
}

/** Absolute URL for a portal path (`/portal`, `/portal/invoices/abc`, …). */
export function portalUrl(path: string = "/portal"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${appUrl()}${suffix}`;
}
