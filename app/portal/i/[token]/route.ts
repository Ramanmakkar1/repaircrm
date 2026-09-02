import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import {
  PORTAL_COOKIE,
  portalCookieOptions,
  signPortalSession,
} from "@/lib/portal-session";

/**
 * FRICTIONLESS INVOICE LINK — `/portal/i/<publicToken>`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `/portal/invoices/<id>` is guarded by `requirePortalCustomer`, so a customer
 * who taps the link in their invoice email lands on a sign-in form and has to
 * request a SECOND email just to read the first one. Most of them don't, and
 * the shop chases a payment that was one tap away.
 *
 * This route closes that gap: the invoice's own `publicToken` identifies the
 * document, the document identifies its customer, and the cookie is minted for
 * THAT customer before redirecting to the page that was linked.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SAFE
 * ---------------------------------------------------------------------------
 *   · The session is derived from the DOCUMENT, never from the request. The
 *     cookie carries `{ customerId, shopId }` read off the invoice row, so a
 *     token can only ever open the account that owns it. Every portal query
 *     then filters on both ids (see lib/portal-session), which is what makes
 *     "see another customer's invoice" impossible rather than merely unlikely.
 *   · `publicToken` is a cuid — unguessable, unique, and never sequential.
 *   · The cookie is `httpOnly`, `sameSite=lax` and scoped to `path=/portal`, so
 *     it is never attached to a staff request and cannot be read by script.
 *   · The same helper mints it as the magic-link route (`/portal/verify`), so
 *     there is exactly one session shape in the system.
 *
 * ---------------------------------------------------------------------------
 * DOCUMENTED LIMITATION: THESE LINKS DO NOT EXPIRE
 * ---------------------------------------------------------------------------
 * A magic-link `PortalToken` lives 24 hours. A `publicToken` lives as long as
 * the invoice does — the schema has no expiry column for it, and rotating it
 * would break every link already sitting in a customer's inbox, which is the
 * one thing a "view your invoice" link may not do.
 *
 * The consequence is honest and worth stating: anyone who obtains the URL —
 * a forwarded email, a shared screenshot — gets read access to that customer's
 * portal (and can start a payment for their own money) until the invoice is
 * deleted. That is the same bargain every invoicing product makes with emailed
 * document links. It is why these URLs belong in a message addressed to the
 * customer and nowhere else, and why staff copy them from a "Copy view link"
 * button that says what it is rather than from the address bar.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // `findFirst`, not `findUnique`, so the DRAFT guard can ride along in the
  // same query: a link that was copied while the document was still a draft
  // lands on the same "invalid" page as a bad token, and mints no session.
  const invoice = await db.invoice.findFirst({
    where: { publicToken: token, status: { not: "DRAFT" } },
    select: { id: true, customerId: true, shopId: true },
  });

  if (!invoice) {
    // Deliberately the same destination a bad magic link reaches: a stranger
    // probing tokens learns nothing from the response about whether one exists.
    const failed = new URL("/portal", request.nextUrl.origin);
    failed.searchParams.set("error", "invalid");
    return NextResponse.redirect(failed);
  }

  const response = NextResponse.redirect(
    new URL(`/portal/invoices/${invoice.id}`, request.nextUrl.origin),
  );
  // Written onto the redirect itself so the Set-Cookie header and the 302 are
  // unambiguously the same response — `cookies().set()` cannot be trusted to
  // land on a response the framework builds separately.
  response.cookies.set(
    PORTAL_COOKIE,
    await signPortalSession({
      customerId: invoice.customerId,
      shopId: invoice.shopId,
    }),
    portalCookieOptions(),
  );
  return response;
}
