import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createConnectionToken } from "@/lib/payments";

/**
 * POST /api/payments/terminal/connection-token
 *
 * Stripe's terminal.js needs a credential to talk to a reader, and this is the
 * only one it is ever given: a short-lived token scoped to one reader session.
 * The secret key stays on this server. That split is the entire security model
 * of Terminal, and it is why this endpoint exists rather than the register
 * holding a key.
 *
 * `requireUser` is the gate — signed-in staff of any role, because anyone who
 * can work the till can take a card. The shop is read from the session, so the
 * token is minted against the caller's own connected account and never one
 * named in the request.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(): Promise<NextResponse> {
  const { shopId } = await requireUser();

  const result = await createConnectionToken(shopId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: 400, headers: NO_STORE },
    );
  }

  return NextResponse.json({ secret: result.secret }, { headers: NO_STORE });
}
