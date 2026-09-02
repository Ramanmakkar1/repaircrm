import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { redirectUri } from "@/lib/integrations/config";
import {
  backToTab,
  connectFailure,
  saveConnection,
} from "@/lib/integrations/connect";
import { exchangeCode, verifyState } from "@/lib/integrations/oauth";
import { fetchCompanyName } from "@/lib/integrations/quickbooks";

/**
 * GET /api/integrations/quickbooks/callback — step two of the OAuth dance.
 *
 * Intuit sends back `code`, `state` and `realmId` (the company id, which is
 * the tenant everything is then addressed to).
 *
 * TWO INDEPENDENT CHECKS, on purpose:
 *   1. the signed `state` names the shop this flow started for — a forged
 *      callback cannot mint one, so it cannot attach a company to a shop;
 *   2. the current session must be an owner of THAT SAME shop — so a link
 *      pasted into a different owner's browser does nothing either.
 * Either alone would do; both together means a mistake in one is not a hole.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  // The operator pressed Cancel on Intuit's consent screen.
  const denied = params.get("error");
  if (denied) {
    return backToTab(request, { error: "cancelled", provider: "quickbooks" });
  }

  const state = await verifyState(params.get("state"), "quickbooks");
  const code = params.get("code");
  const realmId = params.get("realmId");

  if (!state || !code || !realmId) {
    return backToTab(request, { error: "bad-callback", provider: "quickbooks" });
  }

  const session = await getSession();
  if (!session || session.shopId !== state.shopId || session.role !== "OWNER") {
    return backToTab(request, { error: "owner-only", provider: "quickbooks" });
  }

  try {
    const tokens = await exchangeCode(
      "quickbooks",
      code,
      redirectUri("quickbooks"),
    );

    // The company's own name, so the card can say what it is connected to.
    // A failure here is cosmetic — the realmId still identifies the tenant.
    let tenantName: string | null = null;
    try {
      tenantName = await fetchCompanyName({
        accessToken: tokens.accessToken,
        tenantId: realmId,
      });
    } catch {
      tenantName = null;
    }

    await saveConnection({
      shopId: state.shopId,
      provider: "quickbooks",
      tokens,
      tenantId: realmId,
      tenantName,
      status: "connected",
    });

    return backToTab(request, { connected: "quickbooks" });
  } catch (error) {
    return connectFailure(request, "quickbooks", error);
  }
}
