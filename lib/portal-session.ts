import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { db } from "@/lib/db";

/**
 * Customer-portal session.
 *
 * SEPARATE FROM STAFF AUTH — ON PURPOSE
 * -------------------------------------
 * This is a second, parallel session with its own cookie (`rf_portal`), its own
 * payload and its own guard. It deliberately shares nothing with `rf_session`
 * beyond the signing secret and the HS256 shape:
 *
 *   - A staff cookie can never authorise a portal page, and a portal cookie can
 *     never authorise a staff page, because neither payload verifies as the
 *     other (a `SessionUser` needs userId/role; a portal payload has neither).
 *   - The payload is the minimum needed to scope every query: `{ customerId,
 *     shopId }`. There is no role, and there is nothing a tampered token could
 *     escalate into — every portal query filters on BOTH ids.
 *
 * The cookie is issued only in exchange for an unguessable, expiring
 * `PortalToken` that was emailed to the address on the customer record.
 */

export const PORTAL_COOKIE = "rf_portal";

/** 7 days, in seconds. The magic link that opens it lives for 24h (below). */
export const PORTAL_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Magic-link lifetime, in milliseconds. */
export const PORTAL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type PortalSession = {
  customerId: string;
  shopId: string;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add it to .env before starting the app.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signPortalSession(
  session: PortalSession,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...session, kind: "portal" } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + PORTAL_SESSION_MAX_AGE)
    .setSubject(session.customerId)
    .sign(secretKey());
}

export async function verifyPortalSession(
  token: string | undefined | null,
): Promise<PortalSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    const { customerId, shopId, kind } = payload as Record<string, unknown>;
    // `kind` is what stops a valid staff cookie from being replayed here.
    if (
      kind !== "portal" ||
      typeof customerId !== "string" ||
      typeof shopId !== "string"
    ) {
      return null;
    }
    return { customerId, shopId };
  } catch {
    // Expired, tampered with, or signed by a different AUTH_SECRET.
    return null;
  }
}

/**
 * `path: "/portal"` is doing real work: the browser never attaches this cookie
 * to a staff request, so the two sessions cannot be confused even by accident.
 */
export function portalCookieOptions(maxAge: number = PORTAL_SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge,
  };
}

/** Server Action / Route Handler only — cookies cannot be set during a render. */
export async function setPortalCookie(session: PortalSession): Promise<void> {
  const jar = await cookies();
  jar.set(PORTAL_COOKIE, await signPortalSession(session), portalCookieOptions());
}

/** Server Action / Route Handler only. */
export async function clearPortalCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(PORTAL_COOKIE, "", portalCookieOptions(0));
}

/** Reads and verifies the portal cookie. Safe to call during a render. */
export async function getPortalSession(): Promise<PortalSession | null> {
  const jar = await cookies();
  return verifyPortalSession(jar.get(PORTAL_COOKIE)?.value);
}

/**
 * The guard every portal page calls. Re-reads the customer from the database so
 * a deleted (or moved) customer cannot keep browsing on a still-valid cookie,
 * and returns the shop alongside — every page needs the shop name anyway.
 *
 * `next` is where to come back to after the customer signs in again.
 */
export async function requirePortalCustomer(next?: string) {
  const session = await getPortalSession();
  if (!session) redirect(signInPath(next));

  const customer = await db.customer.findFirst({
    where: { id: session.customerId, shopId: session.shopId },
    select: {
      id: true,
      shopId: true,
      firstName: true,
      lastName: true,
      businessName: true,
      email: true,
      shop: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          settings: true,
        },
      },
    },
  });
  if (!customer) redirect(signInPath(next));

  return customer;
}

function signInPath(next?: string): string {
  const safe = safeNextPath(next);
  return safe ? `/portal?next=${encodeURIComponent(safe)}` : "/portal";
}

/**
 * Only same-origin portal paths are allowed to survive a round trip through a
 * query string — otherwise `?next=` is an open redirect with a friendly name.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/portal")) return null;
  if (raw.startsWith("//")) return null;
  if (/[\r\n]/.test(raw)) return null;
  return raw;
}

// ---------------------------------------------------------------------------
// Magic-link tokens
// ---------------------------------------------------------------------------

/** Mints a fresh 24h magic-link token for a customer. */
export async function issuePortalToken(customerId: string): Promise<string> {
  const row = await db.portalToken.create({
    data: {
      customerId,
      expiresAt: new Date(Date.now() + PORTAL_TOKEN_TTL_MS),
    },
    select: { token: true },
  });
  return row.token;
}

/**
 * Exchanges a magic-link token for the session it represents.
 *
 * `usedAt` is stamped on first exchange but a token stays usable until it
 * expires. Burning it on first touch reads as more secure and is worse in
 * practice: corporate mail scanners pre-fetch links, so a strictly single-use
 * link is routinely dead before the customer ever clicks it. The 24h window is
 * what bounds the risk.
 */
export async function consumePortalToken(
  token: string | null | undefined,
): Promise<PortalSession | null> {
  const value = String(token ?? "").trim();
  if (!value) return null;

  const row = await db.portalToken.findUnique({
    where: { token: value },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      customer: { select: { id: true, shopId: true } },
    },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;

  if (!row.usedAt) {
    await db.portalToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
  }

  return { customerId: row.customer.id, shopId: row.customer.shopId };
}
