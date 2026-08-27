/**
 * Outbound customer messaging.
 *
 * ONE WAY OUT
 * -----------
 * Every customer-facing email or SMS in the app goes through `sendEmail()` /
 * `sendSms()`. Nothing else writes a `CommunicationLog` row. That is the whole
 * point of this module: the outbox is the customer's communication history, and
 * a history with duplicate rows (or missing ones) is worse than no history.
 *
 *   - Exactly one CommunicationLog row per call. Always. Including the calls
 *     that never leave the building — an opt-out or a missing address is a fact
 *     staff need to see, not silence.
 *   - `status` records what actually happened: "logged" | "sent" |
 *     "skipped: opted out" | "skipped: no address" | "failed: <reason>".
 *   - Never throws for a delivery problem. Callers are Server Actions in the
 *     middle of a business transaction; a bounced email must not undo a ticket
 *     update. Do the DB work first, then send.
 *
 * The provider is chosen by env (see ./config) — "log" by default, which prints
 * a readable block to the server console and files the row as "logged".
 */

import { db } from "@/lib/db";
import { paymentsLive } from "@/lib/payments/config";
import { portalUrl } from "./config";
import { deliverEmail, deliverSms } from "./drivers";
import { renderEmail, renderSms } from "./templates";

export { appUrl, portalUrl, emailDriverName, smsDriverName } from "./config";
export { renderEmail, renderSms } from "./templates";

export type SendInput = {
  shopId: string;
  customerId: string;
  ticketId?: string | null;
  invoiceId?: string | null;
  /**
   * Destination address/number. Optional: when omitted the customer's own
   * email/mobile is used, which is what nearly every caller wants.
   */
  to?: string | null;
  body: string;
  /** Portal path the footer link should point at. Defaults to the portal home. */
  portalPath?: string;
  /** Small line under the shop name, e.g. "Ticket #1042". */
  context?: string | null;
};

export type SendEmailInput = SendInput & { subject: string };

export type SendResult = {
  /** True only when the message was handed to a provider (or the log driver). */
  ok: boolean;
  /** The value written to `CommunicationLog.status`. */
  status: string;
  /** The outbox row, or null when the customer could not be resolved. */
  logId: string | null;
};

const SKIP_OPTED_OUT = "skipped: opted out";
const SKIP_NO_ADDRESS = "skipped: no address";

/** A status that means "we handed it off" rather than "we filed a note". */
function delivered(status: string): boolean {
  return status === "sent" || status === "logged";
}

/**
 * Loads the customer *within the shop*, so a mismatched pair can never address
 * another tenant's customer — the same rule every query in the app follows.
 */
async function loadContext(shopId: string, customerId: string) {
  const [customer, shop] = await Promise.all([
    db.customer.findFirst({
      where: { id: customerId, shopId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        mobile: true,
        phone: true,
        emailOptIn: true,
        smsOptIn: true,
      },
    }),
    db.shop.findUnique({ where: { id: shopId }, select: { name: true } }),
  ]);
  if (!customer || !shop) return null;
  return { customer, shopName: shop.name };
}

async function writeLog(input: {
  shopId: string;
  customerId: string;
  ticketId?: string | null;
  invoiceId?: string | null;
  type: "EMAIL" | "SMS";
  to: string;
  subject?: string | null;
  body: string;
  status: string;
}): Promise<string> {
  const row = await db.communicationLog.create({
    data: {
      shopId: input.shopId,
      customerId: input.customerId,
      ticketId: input.ticketId ?? null,
      invoiceId: input.invoiceId ?? null,
      type: input.type,
      direction: "OUT",
      to: input.to,
      subject: input.subject ?? null,
      // The outbox stores the message as staff wrote it. The branded wrapper is
      // a delivery detail; re-reading it in the timeline is just noise.
      body: input.body,
      status: input.status,
    },
    select: { id: true },
  });
  return row.id;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const context = await loadContext(input.shopId, input.customerId);
  if (!context) {
    // No customer row means no valid FK, so there is nothing to log against.
    return { ok: false, status: "failed: unknown customer", logId: null };
  }

  const { customer, shopName } = context;
  const to = (input.to ?? customer.email ?? "").trim();

  const base = {
    shopId: input.shopId,
    customerId: customer.id,
    ticketId: input.ticketId,
    invoiceId: input.invoiceId,
    type: "EMAIL" as const,
    subject: input.subject,
    body: input.body,
  };

  if (!customer.emailOptIn) {
    const logId = await writeLog({ ...base, to, status: SKIP_OPTED_OUT });
    return { ok: false, status: SKIP_OPTED_OUT, logId };
  }
  if (!to) {
    const logId = await writeLog({ ...base, to: "", status: SKIP_NO_ADDRESS });
    return { ok: false, status: SKIP_NO_ADDRESS, logId };
  }

  const link = portalUrl(input.portalPath ?? "/portal");
  const rendered = renderEmail({
    shopName,
    subject: input.subject,
    body: input.body,
    portalUrl: link,
    context: input.context ?? null,
    // An email about an invoice, sent while card payments are live, whose link
    // lands on that invoice's own page — only then is "pay online" a promise
    // the destination can keep.
    payOnline:
      Boolean(input.invoiceId) &&
      link.includes(`/portal/invoices/${input.invoiceId}`) &&
      paymentsLive(),
  });

  const status = await deliverEmail({
    to,
    subject: input.subject,
    text: rendered.text,
    html: rendered.html,
  });

  const logId = await writeLog({ ...base, to, status });
  return { ok: delivered(status), status, logId };
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

export async function sendSms(input: SendInput): Promise<SendResult> {
  const context = await loadContext(input.shopId, input.customerId);
  if (!context) {
    return { ok: false, status: "failed: unknown customer", logId: null };
  }

  const { customer, shopName } = context;
  // Only `mobile` — a landline in `phone` cannot receive texts, and billing a
  // shop for an undeliverable segment is not a kindness.
  const to = (input.to ?? customer.mobile ?? "").trim();

  const base = {
    shopId: input.shopId,
    customerId: customer.id,
    ticketId: input.ticketId,
    invoiceId: input.invoiceId,
    type: "SMS" as const,
    subject: null,
    body: input.body,
  };

  if (!customer.smsOptIn) {
    const logId = await writeLog({ ...base, to, status: SKIP_OPTED_OUT });
    return { ok: false, status: SKIP_OPTED_OUT, logId };
  }
  if (!to) {
    const logId = await writeLog({ ...base, to: "", status: SKIP_NO_ADDRESS });
    return { ok: false, status: SKIP_NO_ADDRESS, logId };
  }

  const text = renderSms({
    shopName,
    body: input.body,
    portalUrl: portalUrl(input.portalPath ?? "/portal"),
  });

  const status = await deliverSms({ to, body: text });

  const logId = await writeLog({ ...base, to, status });
  return { ok: delivered(status), status, logId };
}

// ---------------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------------

/**
 * Files something the *customer* did (a portal approval, a reply) into the same
 * outbox staff already read, as `direction: "IN"`. Nothing is delivered — this
 * only records that it happened.
 */
export async function logInbound(input: {
  shopId: string;
  customerId: string;
  ticketId?: string | null;
  invoiceId?: string | null;
  type?: "EMAIL" | "SMS";
  from?: string | null;
  subject?: string | null;
  body: string;
  status?: string;
}): Promise<string | null> {
  const customer = await db.customer.findFirst({
    where: { id: input.customerId, shopId: input.shopId },
    select: { id: true, email: true },
  });
  if (!customer) return null;

  const row = await db.communicationLog.create({
    data: {
      shopId: input.shopId,
      customerId: customer.id,
      ticketId: input.ticketId ?? null,
      invoiceId: input.invoiceId ?? null,
      type: input.type ?? "EMAIL",
      direction: "IN",
      to: (input.from ?? customer.email ?? "").trim(),
      subject: input.subject ?? null,
      body: input.body,
      status: input.status ?? "portal",
    },
    select: { id: true },
  });
  return row.id;
}
