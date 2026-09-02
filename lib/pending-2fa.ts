import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { authSecretKey } from "@/lib/session";

/**
 * The gap between "the password was right" and "you are signed in".
 *
 * When an account has 2FA switched on, `login()` must NOT issue a session — the
 * second factor has not been presented yet. It issues this instead: a five
 * minute, signed, http-only token naming the user who got their password right,
 * which /login/verify exchanges for a real session once the code checks out.
 *
 * It is a separate cookie with a distinct `kind` claim, so a pending token can
 * never be replayed as `rf_session` even though both are HS256 over AUTH_SECRET.
 */

export const PENDING_2FA_COOKIE = "rf_2fa";

/** Long enough to fetch a phone, short enough that a shared computer forgets. */
export const PENDING_2FA_MAX_AGE = 60 * 5;

const KIND = "pending-2fa";

export async function setPending2faCookie(userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ kind: KIND, userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + PENDING_2FA_MAX_AGE)
    .setSubject(userId)
    .sign(authSecretKey());

  const jar = await cookies();
  jar.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_2FA_MAX_AGE,
  });
}

/** The user id half-way through signing in, or null. Safe during a render. */
export async function readPending2fa(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, authSecretKey(), {
      algorithms: ["HS256"],
    });
    // The kind claim is what stops a full session token being posted here.
    if (payload.kind !== KIND) return null;
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    // Expired, tampered with, or signed by a different AUTH_SECRET.
    return null;
  }
}

/** Server Action / Route Handler only. */
export async function clearPending2faCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_2FA_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
