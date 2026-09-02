import { QBO_SCOPE, qboAuthBase, qboClientId } from "@/lib/integrations/config";
import {
  authorizeUrl,
  backToTab,
  requireOwnerShop,
} from "@/lib/integrations/connect";
import { NextResponse } from "next/server";

/**
 * GET /api/integrations/quickbooks/connect — step one of the OAuth dance.
 *
 * Sends the owner to Intuit's consent screen with a signed `state` carrying
 * their shopId (see lib/integrations/oauth.ts for why that matters). Nothing
 * is written here; the connection row only exists once Intuit hands back a
 * code and the callback exchanges it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireOwnerShop(request, "quickbooks");
  if ("response" in guard) return guard.response;

  const clientId = qboClientId();
  if (!clientId) return backToTab(request, { error: "not-configured" });

  return NextResponse.redirect(
    await authorizeUrl(
      qboAuthBase(),
      "/connect/oauth2",
      "quickbooks",
      guard.shopId,
      QBO_SCOPE,
      clientId,
    ),
  );
}
