import { NextResponse, type NextRequest } from "next/server";

import { PORTAL_COOKIE, portalCookieOptions } from "@/lib/portal-session";

/**
 * Clears the portal cookie and drops the customer back at the front door.
 *
 * A GET is deliberate here: this is a plain link in the header, it destroys
 * nothing but a session, and a customer on a shared machine should be able to
 * sign out without JavaScript.
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/portal", request.nextUrl.origin),
  );
  response.cookies.set(PORTAL_COOKIE, "", portalCookieOptions(0));
  return response;
}
