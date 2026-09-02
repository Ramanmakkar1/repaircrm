import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  emailAddress,
  emailDisplayName,
  htmlToText,
  ingestInbound,
  stripQuotedReply,
} from "../_lib/inbound";
import { verifyResendSignature } from "../_lib/signatures";
import { resolveShopByEmail } from "../_lib/shop";

/**
 * POST /api/inbound/email — a customer replied to one of our emails.
 *
 * TWO WAYS IN, EACH WITH ITS OWN LOCK
 * -----------------------------------
 *   1. RESEND INBOUND. Point a Resend inbound address at this URL. Deliveries
 *      are signed with Svix headers and verified against RESEND_WEBHOOK_SECRET.
 *   2. GENERIC JSON, guarded by `?token=INBOUND_SECRET`:
 *
 *        { "from", "to", "subject", "text", "html", "messageId" }
 *
 *      For a shop forwarding mail through their own script, a different ESP, or
 *      a `curl` while setting it up.
 *
 * FAILS CLOSED. With neither secret set the endpoint answers 503 — "this
 * deployment has not been configured for inbound mail", which is a different
 * fact from "your credential was wrong", and an unauthenticated version of this
 * route would let anyone write comments onto a customer's repair ticket.
 *
 * ALWAYS 200 ONCE AUTHENTICATED. A message we cannot place (no matching shop,
 * an empty body) is acknowledged rather than rejected, because every provider
 * treats a non-2xx as "retry", and retrying will not make the address match.
 * The reason rides in the body for whoever is reading the provider's log.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<NextResponse> {
  const resendSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const inboundToken = process.env.INBOUND_SECRET?.trim();

  if (!resendSecret && !inboundToken) {
    return json(
      {
        error: "inbound email is disabled",
        hint: "Set RESEND_WEBHOOK_SECRET (for Resend inbound) or INBOUND_SECRET (for the generic ?token= form).",
      },
      503,
    );
  }

  // The body is read as TEXT and only then parsed: a signature covers the exact
  // bytes that arrived, and re-serialising the JSON would change them.
  const raw = await request.text();

  const presentedToken = new URL(request.url).searchParams.get("token");
  const hasSvix = request.headers.has("svix-signature");

  if (hasSvix) {
    if (!resendSecret) {
      return json({ error: "RESEND_WEBHOOK_SECRET is not set" }, 401);
    }
    const verified = verifyResendSignature({
      payload: raw,
      secret: resendSecret,
      headers: request.headers,
    });
    if (!verified.ok) {
      console.warn(`[inbound] rejected email: ${verified.reason}`);
      return json({ error: `invalid signature: ${verified.reason}` }, 401);
    }
  } else if (presentedToken) {
    if (!inboundToken || !tokenMatches(presentedToken, inboundToken)) {
      return json({ error: "unauthorized" }, 401);
    }
  } else {
    return json(
      {
        error: "unauthorized",
        hint: "Send Svix signature headers (Resend), or ?token=INBOUND_SECRET.",
      },
      401,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }

  const message = readEmail(payload);
  if (!message) {
    return json({ ok: true, ignored: "no usable from/body in payload" });
  }

  const shop = await resolveShopByEmail(message.to);
  if (!shop.ok) {
    return json({ ok: true, ignored: shop.reason });
  }

  const outcome = await ingestInbound({
    shopId: shop.shopId,
    channel: "EMAIL",
    from: message.from,
    fromName: message.fromName,
    subject: message.subject,
    body: message.body,
    providerMessageId: message.messageId,
  });

  return json({ ok: true, outcome });
}

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  // Lengths are compared first because timingSafeEqual throws on a mismatch;
  // the length of a shared secret is not the part worth hiding.
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

type ParsedEmail = {
  from: string;
  fromName: string | null;
  to: string[];
  subject: string | null;
  body: string;
  messageId: string | null;
};

/**
 * Reads BOTH shapes with one function.
 *
 * Resend wraps the mail in `{ type, data: { … } }`; the generic form is the
 * fields at the top level. Rather than branch on a `type` string that may be
 * renamed, this unwraps `data` when it is there and then looks for the same
 * field names — which happen to be the same names in both, because Resend's
 * inbound payload uses the obvious ones.
 *
 * `to` is an array in one and a string in the other, so it is normalised here
 * and every recipient is offered to the shop matcher — a shop's inbound address
 * is as likely to be on Cc as on To when a customer replies-all.
 */
function readEmail(payload: unknown): ParsedEmail | null {
  if (!payload || typeof payload !== "object") return null;

  const envelope = payload as Record<string, unknown>;
  const data =
    envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
      ? (envelope.data as Record<string, unknown>)
      : envelope;

  const from = str(data.from) ?? str(data.sender);
  if (!from) return null;

  const text = str(data.text) ?? str(data.plain);
  const html = str(data.html);
  const raw = text ?? (html ? htmlToText(html) : null);
  if (!raw) return null;

  return {
    from: emailAddress(from),
    fromName: emailDisplayName(from),
    to: [...list(data.to), ...list(data.cc)],
    subject: str(data.subject),
    // The quoted history is dropped from the timeline comment; the full message
    // is still stored on the CommunicationLog row by ingestInbound.
    body: stripQuotedReply(raw),
    messageId: str(data.messageId) ?? str(data.message_id) ?? str(envelope.id),
  };
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Accepts `"a@b.com"`, `["a@b.com"]`, and `[{ address: "a@b.com" }]`. */
function list(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").map((part) => part.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        return str(record.address) ?? str(record.email) ?? "";
      }
      return "";
    })
    .filter(Boolean);
}
