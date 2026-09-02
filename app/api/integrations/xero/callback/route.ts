import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { redirectUri } from "@/lib/integrations/config";
import {
  backToTab,
  connectFailure,
  saveConnection,
} from "@/lib/integrations/connect";
import { exchangeCode, verifyState } from "@/lib/integrations/oauth";
import { fetchXeroTenants } from "@/lib/integrations/xero";

/**
 * GET /api/integrations/xero/callback — step two of the OAuth dance.
 *
 * Xero's grant is not tied to one organisation. `GET /connections` turns the
 * fresh token into the list it actually covers, and:
 *
 *   one organisation   connect straight to it, nobody needs a question;
 *   several            store the tokens as "pending" with the choices, and
 *                      send the operator to a picker. Guessing here would mean
 *                      writing one shop's invoices into a different client's
 *                      books, which no Disconnect button undoes.
 *   none               the grant covers nothing; say so rather than store a
 *                      connection that can never sync.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  const denied = params.get("error");
  if (denied) {
    return backToTab(request, { error: "cancelled", provider: "xero" });
  }

  const state = await verifyState(params.get("state"), "xero");
  const code = params.get("code");

  if (!state || !code) {
    return backToTab(request, { error: "bad-callback", provider: "xero" });
  }

  const session = await getSession();
  if (!session || session.shopId !== state.shopId || session.role !== "OWNER") {
    return backToTab(request, { error: "owner-only", provider: "xero" });
  }

  try {
    const tokens = await exchangeCode("xero", code, redirectUri("xero"));
    const tenants = await fetchXeroTenants(tokens.accessToken);

    if (tenants.length === 0) {
      return backToTab(request, { error: "no-tenant", provider: "xero" });
    }

    if (tenants.length === 1) {
      await saveConnection({
        shopId: state.shopId,
        provider: "xero",
        tokens,
        tenantId: tenants[0].tenantId,
        tenantName: tenants[0].tenantName,
        status: "connected",
        settings: { xeroTenants: tenants },
      });
      return backToTab(request, { connected: "xero" });
    }

    await saveConnection({
      shopId: state.shopId,
      provider: "xero",
      tokens,
      tenantId: null,
      tenantName: null,
      status: "pending",
      settings: { xeroTenants: tenants },
    });

    return NextResponse.redirect(
      new URL("/settings/integrations/xero-tenant", new URL(request.url).origin),
    );
  } catch (error) {
    return connectFailure(request, "xero", error);
  }
}
