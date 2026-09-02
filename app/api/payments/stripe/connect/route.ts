import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { connectAuthorizeUrl, connectConfigured } from "@/lib/payments";
import { db } from "@/lib/db";

/**
 * GET /api/payments/stripe/connect — step one of one-click onboarding.
 *
 * A GET that redirects, rather than a Server Action, because the destination is
 * Stripe's own domain: the owner has to leave this app entirely, and a plain
 * link is the honest way to say so. The button in Settings → Payments is an
 * anchor pointing here.
 *
 * WHAT THIS ENDPOINT IS CAREFUL ABOUT
 *   · OWNER only. Connecting a bank account is not a front-desk decision.
 *   · The shopId in the outgoing `state` comes from the session and nowhere
 *     else, signed with AUTH_SECRET, so the callback cannot be pointed at a
 *     tenant the caller does not belong to.
 *   · Already connected? Send them back rather than starting a second
 *     authorization that would silently replace the first.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await requireUser();
  const settings = new URL(
    "/settings?tab=payments",
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3020",
  );

  if (session.role !== "OWNER") {
    settings.searchParams.set("stripe", "forbidden");
    return NextResponse.redirect(settings);
  }

  if (!connectConfigured()) {
    settings.searchParams.set("stripe", "unconfigured");
    return NextResponse.redirect(settings);
  }

  const shop = await db.shop.findUnique({
    where: { id: session.shopId },
    select: { name: true, email: true, stripeAccountId: true },
  });
  if (shop?.stripeAccountId) {
    settings.searchParams.set("stripe", "already-connected");
    return NextResponse.redirect(settings);
  }

  const url = connectAuthorizeUrl({
    shopId: session.shopId,
    shopName: shop?.name ?? null,
    email: shop?.email ?? session.email,
  });

  // no-store: a cached 302 to a one-time `state` is a broken button tomorrow.
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
