import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import {
  PORTAL_COOKIE,
  portalCookieOptions,
  signPortalSession,
} from "@/lib/portal-session";

/**
 * FRICTIONLESS ESTIMATE LINK — `/portal/e/<publicToken>`.
 *
 * The estimate twin of `/portal/i/<token>`; that file carries the full security
 * reasoning and the documented "these links do not expire" limitation, and this
 * one deliberately does not restate it.
 *
 * It matters more here than on an invoice: an estimate email exists to get an
 * approve/decline decision, and every extra step between the email and the two
 * buttons is a job the shop does not get to start.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const estimate = await db.estimate.findUnique({
    where: { publicToken: token },
    select: { id: true, customerId: true, shopId: true },
  });

  if (!estimate) {
    const failed = new URL("/portal", request.nextUrl.origin);
    failed.searchParams.set("error", "invalid");
    return NextResponse.redirect(failed);
  }

  const response = NextResponse.redirect(
    new URL(`/portal/estimates/${estimate.id}`, request.nextUrl.origin),
  );
  response.cookies.set(
    PORTAL_COOKIE,
    await signPortalSession({
      customerId: estimate.customerId,
      shopId: estimate.shopId,
    }),
    portalCookieOptions(),
  );
  return response;
}
