import { NextResponse } from "next/server";

import { ingestInbound } from "../_lib/inbound";
import { publicUrlFor, verifyTwilioSignature } from "../_lib/signatures";
import { resolveShopBySms } from "../_lib/shop";

/**
 * POST /api/inbound/sms — a customer texted the shop's number back.
 *
 * Twilio posts `application/x-www-form-urlencoded` with `From`, `To`, `Body`
 * and `MessageSid`, and signs the request in `X-Twilio-Signature`.
 *
 * FAILS CLOSED. Without `TWILIO_AUTH_TOKEN` there is no way to tell a real
 * delivery from a stranger with the URL, so the endpoint answers 503 and
 * accepts nothing. An unauthenticated version of this route would let anyone
 * post a text "from" any customer onto that customer's ticket.
 *
 * THE REPLY IS EMPTY TwiML. Twilio renders whatever we return as an automatic
 * response to the customer, so `<Response/>` is us declining to auto-reply —
 * the shop answers from the ticket, in their own words. Returning nothing at
 * all would be an error in Twilio's console on every message.
 *
 * ALWAYS 200 once the signature checks out. A message we cannot place is
 * acknowledged: Twilio retries non-2xx, and retrying will not make an unknown
 * number known.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Twilio expects TwiML; an empty Response means "say nothing back". */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): NextResponse {
  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    console.error("[inbound] TWILIO_AUTH_TOKEN is not set; rejecting SMS webhook");
    return NextResponse.json(
      {
        error: "inbound SMS is disabled",
        hint: "Set TWILIO_AUTH_TOKEN so deliveries can be verified.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "body must be form-encoded" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Every field is signed, not just the ones we read — Twilio's digest covers
  // the whole parameter set, so dropping any of them breaks verification.
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const verified = verifyTwilioSignature({
    url: publicUrlFor(request),
    params,
    signature: request.headers.get("x-twilio-signature"),
    authToken,
  });

  if (!verified.ok) {
    console.warn(`[inbound] rejected SMS: ${verified.reason}`);
    return NextResponse.json(
      { error: `invalid signature: ${verified.reason}` },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const from = (params.From ?? "").trim();
  const to = (params.To ?? "").trim();
  const body = (params.Body ?? "").trim();
  const sid = (params.MessageSid ?? params.SmsMessageSid ?? "").trim();

  if (!from || !body) return twiml();

  const shop = await resolveShopBySms(to);
  if (!shop.ok) {
    console.warn(`[inbound] SMS from ${from} not placed: ${shop.reason}`);
    return twiml();
  }

  await ingestInbound({
    shopId: shop.shopId,
    channel: "SMS",
    from,
    fromName: null,
    subject: null,
    body,
    providerMessageId: sid || null,
  });

  return twiml();
}
