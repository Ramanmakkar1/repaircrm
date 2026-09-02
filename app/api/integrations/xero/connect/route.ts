import { NextResponse } from "next/server";

import {
  XERO_SCOPE,
  xeroClientId,
  xeroLoginBase,
} from "@/lib/integrations/config";
import {
  authorizeUrl,
  backToTab,
  requireOwnerShop,
} from "@/lib/integrations/connect";

/**
 * GET /api/integrations/xero/connect — step one of the OAuth dance.
 *
 * Same shape as the QuickBooks route; only the host and the scope differ.
 * `offline_access` is in the scope because without it Xero issues no refresh
 * token and the connection dies half an hour later with no visible cause.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireOwnerShop(request, "xero");
  if ("response" in guard) return guard.response;

  const clientId = xeroClientId();
  if (!clientId) return backToTab(request, { error: "not-configured" });

  return NextResponse.redirect(
    await authorizeUrl(
      xeroLoginBase(),
      "/identity/connect/authorize",
      "xero",
      guard.shopId,
      XERO_SCOPE,
      clientId,
    ),
  );
}
