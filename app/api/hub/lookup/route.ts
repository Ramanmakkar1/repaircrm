import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import { invoiceTokenPath, portalUrl, sendEmail, sendSms } from "@/lib/comms";
import { db } from "@/lib/db";
import { issuePortalToken } from "@/lib/portal-session";
import { rateLimit } from "@/lib/rate-limit";
import { readCheckinSettings } from "@/components/settings/checkin-meta";
import { readPublicHub } from "@/components/settings/hub-meta";

/**
 * PUBLIC LOOKUP — "check my repair" and "pay a bill" on the shop hub.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE HOSTILE ONE
 * ---------------------------------------------------------------------------
 * `app/api/leads` is public but only ever WRITES a row nobody has to be
 * identified to write. This endpoint is different in kind: an anonymous caller
 * hands it a number and a contact detail, and somewhere behind it there is a
 * real customer's repair. So it follows three rules that the lead endpoint does
 * not need:
 *
 *   · IT NEVER ANSWERS THE QUESTION. Every accepted request — a perfect match,
 *     a real ticket with the wrong email, a ticket number that has never
 *     existed — returns the byte-identical body `{"ok":true}`. The only thing
 *     that ever differs is what lands in the mailbox of whoever is already on
 *     the ticket. There is no "we couldn't find that", because that sentence is
 *     an oracle: it turns this form into a way to enumerate a shop's customers.
 *   · IT IS SAME-ORIGIN. No CORS headers at all, deliberately unlike
 *     /api/leads. The hub page is served from this origin (including inside the
 *     embed's iframe), so nothing legitimate needs a cross-origin POST, and a
 *     wildcard here would let any page on the internet run the guessing for
 *     free.
 *   · IT IS RATE LIMITED PER CALLER, not just per shop. `/api/leads` counts
 *     rows in the table because a lead IS a row; a failed lookup writes
 *     nothing, so there would be nothing to count. Same intent, different
 *     mechanism: lib/rate-limit's fixed window, keyed on the caller's address
 *     and the shop, plus a per-shop ceiling so one bot cannot spend a shop's
 *     whole allowance from a rotating address pool.
 *
 * The honeypot (`website`) and the "answer 201-shaped success to a caught bot"
 * behaviour are copied straight from /api/leads, so a shop's two public forms
 * behave the same way under the same spam run.
 *
 * On a match we mint nothing new: "check my repair" issues the existing 24h
 * `PortalToken` magic link, and "pay a bill" sends the existing frictionless
 * `/portal/i/<publicToken>` invoice link. There is exactly one customer session
 * in this product and this is not a second one.
 */

export const dynamic = "force-dynamic";

/** Per caller, per shop. Generous for a human, useless for a dictionary run. */
const PER_CALLER_LIMIT = 8;
const PER_SHOP_LIMIT = 60;
const WINDOW_MS = 15 * 60 * 1000;

/** The one response body this route ever returns for an accepted request. */
const OK = '{"ok":true}';

function ok(): NextResponse {
  // Hand-built rather than NextResponse.json() so the success body is a literal
  // constant — nothing downstream can make a matched request serialise even one
  // byte differently from an unmatched one.
  return new NextResponse(OK, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const schema = z.object({
  shop: z.string().trim().min(1).max(60),
  intent: z.enum(["status", "pay"]),
  /** Ticket or invoice number as the customer reads it: "1042", "#1042". */
  reference: z.string().trim().min(1, "Enter your ticket number.").max(20),
  /** The email or phone on the ticket. */
  contact: z.string().trim().min(3, "Enter the email or phone on the ticket.").max(160),
  /** Honeypot. Must stay empty. */
  website: z.string().max(200).optional(),
});

async function readBody(request: Request): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const value = await request.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const out: Record<string, string> = {};
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === "string") out[key] = raw;
        else if (typeof raw === "number") out[key] = String(raw);
      }
      return out;
    } catch {
      return null;
    }
  }

  try {
    const form = await request.formData();
    const out: Record<string, string> = {};
    for (const [key, raw] of form.entries()) {
      if (typeof raw === "string") out[key] = raw;
    }
    return out;
  } catch {
    return null;
  }
}

/** "#1042" / " 1042 " → 1042. Anything else → null. */
function readNumber(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value > 0 && value < 1e9 ? value : null;
}

/** Last 10 digits, which is what survives +1 / (555) / spaces / dashes. */
function phoneKey(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

type ContactColumns = {
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

/**
 * Does what the visitor typed match the contact details already on the record?
 *
 * An email is compared case-insensitively; a phone number by its last ten
 * digits, because the number a customer types into their own phone is rarely
 * formatted the way the front desk typed it. A blank column never matches — an
 * empty string must not be a skeleton key.
 */
function contactMatches(customer: ContactColumns, typed: string): boolean {
  const value = typed.trim();
  if (!value) return false;

  if (value.includes("@")) {
    const email = (customer.email ?? "").trim().toLowerCase();
    return email !== "" && email === value.toLowerCase();
  }

  const key = phoneKey(value);
  if (key.length < 7) return false;
  return key === phoneKey(customer.phone) || key === phoneKey(customer.mobile);
}

/** First hop of x-forwarded-for, same rule as lib/audit's clientIp(). */
async function callerKey(): Promise<string> {
  try {
    const head = await headers();
    const forwarded = head.get("x-forwarded-for");
    const candidate =
      forwarded?.split(",")[0]?.trim() || head.get("x-real-ip")?.trim() || "";
    return candidate ? candidate.slice(0, 45) : "unknown";
  } catch {
    return "unknown";
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readBody(request);
  if (!body) return fail(400, "Body must be JSON or form-encoded.");

  const parsed = schema.safeParse({
    ...body,
    shop: body.shop ?? "",
    intent: body.intent ?? "",
    reference: body.reference ?? "",
    contact: body.contact ?? "",
  });
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "Please check the form.");
  }
  const input = parsed.data;

  // Caught bot: look successful, do nothing. Checked before the shop lookup so
  // a spam run cannot use the response to probe which slugs exist.
  if (input.website && input.website.trim() !== "") return ok();

  const slug = input.shop.toLowerCase();
  const caller = await callerKey();

  const perCaller = rateLimit(`hub-lookup:${caller}:${slug}`, PER_CALLER_LIMIT, WINDOW_MS);
  const perShop = rateLimit(`hub-lookup-shop:${slug}`, PER_SHOP_LIMIT, WINDOW_MS);
  if (!perCaller.allowed || !perShop.allowed) {
    return fail(429, "Too many attempts. Please try again in a little while.");
  }

  const shop = await db.shop.findUnique({
    where: { slug },
    select: { id: true, name: true, settings: true },
  });
  // A slug either exists or it does not, and which one it is was already public
  // the moment the shop put the link on their website — so this 404s like the
  // page does rather than pretending. Nothing about a CUSTOMER is revealed.
  if (!shop) return fail(404, "Unknown shop.");

  const hub = readPublicHub(shop.settings);
  const checkin = readCheckinSettings(shop.settings);
  const live = hub.enabled || checkin.enabled;
  const cardOn = input.intent === "status" ? hub.cards.status : hub.cards.pay;
  if (!live || !hub.enabled || !cardOn) return fail(404, "Unknown shop.");

  const number = readNumber(input.reference);
  // A reference that is not a number cannot match anything — but it must still
  // answer like a reference that simply did not match.
  if (number === null) return ok();

  if (input.intent === "status") {
    await handleStatus(shop.id, shop.name, number, input.contact);
  } else {
    await handlePay(shop.id, shop.name, number, input.contact);
  }

  return ok();
}

/**
 * Sends the existing 24h magic link, pointed at the ticket the customer asked
 * about. Silent on every failure path — a caller learns nothing either way.
 */
async function handleStatus(
  shopId: string,
  shopName: string,
  number: number,
  contact: string,
): Promise<void> {
  const ticket = await db.ticket.findFirst({
    where: { shopId, number },
    select: {
      id: true,
      number: true,
      customer: {
        select: {
          id: true,
          firstName: true,
          email: true,
          phone: true,
          mobile: true,
        },
      },
    },
  });
  if (!ticket || !contactMatches(ticket.customer, contact)) return;

  const token = await issuePortalToken(ticket.customer.id);
  const linkPath = `/portal?token=${encodeURIComponent(token)}&next=${encodeURIComponent(
    `/portal/tickets/${ticket.id}`,
  )}`;

  await deliver({
    shopId,
    customerId: ticket.customer.id,
    ticketId: ticket.id,
    hasEmail: Boolean(ticket.customer.email),
    subject: `Your repair — ticket #${ticket.number}`,
    body: [
      `Hi ${ticket.customer.firstName},`,
      `Here is your link to ticket #${ticket.number} with ${shopName}. It works for the next 24 hours and needs no password.`,
      portalUrl(linkPath),
    ].join("\n\n"),
    smsBody: `${shopName}: your repair #${ticket.number} — ${portalUrl(linkPath)} (link expires in 24h)`,
    context: `Ticket #${ticket.number}`,
    portalPath: linkPath,
  });
}

/**
 * Sends the existing frictionless invoice link — the one with the Pay button on
 * it. The reference may be an invoice number or the ticket number the customer
 * happens to have kept; both reach the same document.
 */
async function handlePay(
  shopId: string,
  shopName: string,
  number: number,
  contact: string,
): Promise<void> {
  const select = {
    id: true,
    number: true,
    publicToken: true,
    ticketId: true,
    customer: {
      select: {
        id: true,
        firstName: true,
        email: true,
        phone: true,
        mobile: true,
      },
    },
  } as const;

  // Both lookups skip DRAFT. This route emails a customer a link to pay, and a
  // draft is a bill the shop has not decided to send — "we could not find it"
  // is the honest answer until it does.
  const invoice =
    (await db.invoice.findFirst({
      where: { shopId, number, status: { not: "DRAFT" } },
      select,
    })) ??
    // The number on the paper the customer kept is often the TICKET number, so
    // fall back to the newest invoice raised against that ticket.
    (await db.invoice.findFirst({
      where: { shopId, ticket: { shopId, number }, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      select,
    }));

  if (!invoice || !contactMatches(invoice.customer, contact)) return;

  const path = invoiceTokenPath(invoice.publicToken);

  await deliver({
    shopId,
    customerId: invoice.customer.id,
    invoiceId: invoice.id,
    ticketId: invoice.ticketId,
    hasEmail: Boolean(invoice.customer.email),
    subject: `Your invoice #${invoice.number}`,
    body: [
      `Hi ${invoice.customer.firstName},`,
      `Here is your invoice #${invoice.number} from ${shopName}. You can view it and pay it online from this link:`,
      portalUrl(path),
    ].join("\n\n"),
    smsBody: `${shopName}: invoice #${invoice.number} — view and pay: ${portalUrl(path)}`,
    context: `Invoice #${invoice.number}`,
    portalPath: path,
    linkTargetsInvoice: true,
  });
}

/**
 * Email where we have an address, text where we only have a mobile. Both go
 * through lib/comms, so the send is logged on the customer's record exactly
 * like every other message the shop sends — staff can see that a link went out.
 */
async function deliver(input: {
  shopId: string;
  customerId: string;
  ticketId?: string | null;
  invoiceId?: string | null;
  hasEmail: boolean;
  subject: string;
  body: string;
  smsBody: string;
  context: string;
  portalPath: string;
  linkTargetsInvoice?: boolean;
}): Promise<void> {
  if (input.hasEmail) {
    await sendEmail({
      shopId: input.shopId,
      customerId: input.customerId,
      ticketId: input.ticketId,
      invoiceId: input.invoiceId,
      subject: input.subject,
      body: input.body,
      context: input.context,
      portalPath: input.portalPath,
      linkTargetsInvoice: input.linkTargetsInvoice,
    });
    return;
  }

  await sendSms({
    shopId: input.shopId,
    customerId: input.customerId,
    ticketId: input.ticketId,
    invoiceId: input.invoiceId,
    body: input.smsBody,
    context: input.context,
    portalPath: input.portalPath,
    linkTargetsInvoice: input.linkTargetsInvoice,
  });
}
