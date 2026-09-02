import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createTerminalIntent } from "@/lib/payments";

/**
 * POST /api/payments/terminal/intent  { invoiceId }
 *
 * Opens a card-present PaymentIntent for whatever an invoice still owes.
 *
 * THE AMOUNT IS NOT IN THE REQUEST, on purpose. The register sends an invoice
 * id and the server recomputes the balance from that invoice's own lines and
 * payments — the same rule the POS cart follows for prices. A client that
 * could name the amount could charge a customer a dollar for a four-hundred
 * dollar repair.
 *
 * The invoice is looked up with `{ id, shopId }` inside `createTerminalIntent`,
 * so an id from another tenant finds nothing and 400s.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request): Promise<NextResponse> {
  const { shopId } = await requireUser();

  let invoiceId = "";
  try {
    const body = (await request.json()) as { invoiceId?: unknown };
    invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body with an invoiceId." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!invoiceId) {
    return NextResponse.json(
      { error: "Which invoice is this payment for?" },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await createTerminalIntent({ shopId, invoiceId });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: 400, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    {
      id: result.intent.id,
      clientSecret: result.intent.clientSecret,
      amountCents: result.intent.amountCents,
    },
    { headers: NO_STORE },
  );
}
