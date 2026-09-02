import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Session primitives: signing, verifying and (un)setting the `rf_session`
 * cookie. Everything here is server-only.
 *
 * The session is a stateless HS256 JWT. It carries just enough to authorise a
 * request without a DB round-trip on every render — critically the `shopId`,
 * which every query must filter by (see lib/db.ts).
 */

export const SESSION_COOKIE = "rf_session";

/** 7 days, in seconds. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionRole = "OWNER" | "TECH" | "FRONT_DESK";

export type SessionUser = {
  userId: string;
  shopId: string;
  role: SessionRole;
  name: string;
  email: string;
  /**
   * Password version: `User.passwordChangedAt` as epoch seconds, or 0 when the
   * password has never been changed. The (app) layout compares it against the
   * database on every request, so changing a password logs every other browser
   * out without keeping server-side session state (see lib/session-guard.ts).
   */
  pv?: number;
};

const ROLES: readonly SessionRole[] = ["OWNER", "TECH", "FRONT_DESK"];

/**
 * The HS256 key for every token this app signs.
 *
 * Exported because the short-lived "password accepted, 2FA still pending"
 * token (lib/pending-2fa.ts) is signed with the same secret — it carries a
 * distinct `kind` claim and a distinct cookie name, so the two can never be
 * mistaken for one another.
 */
export function authSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add it to .env before starting the app."
    );
  }
  return new TextEncoder().encode(secret);
}

const secretKey = authSecretKey;

export async function signSession(user: SessionUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...user } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE)
    .setSubject(user.userId)
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    const { userId, shopId, role, name, email, pv } = payload as Record<
      string,
      unknown
    >;
    if (
      typeof userId !== "string" ||
      typeof shopId !== "string" ||
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof role !== "string" ||
      !ROLES.includes(role as SessionRole)
    ) {
      return null;
    }
    return {
      userId,
      shopId,
      role: role as SessionRole,
      name,
      email,
      pv: typeof pv === "number" ? pv : 0,
    };
  } catch {
    // Expired, tampered with, or signed by a different AUTH_SECRET.
    return null;
  }
}

/**
 * Writes the session cookie. Can only be called from a Server Action or a
 * Route Handler — Next.js forbids mutating cookies during a render.
 */
export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Clears the session cookie. Server Action / Route Handler only. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Reads and verifies the session cookie. Safe to call during a render. */
export async function readSessionCookie(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}
