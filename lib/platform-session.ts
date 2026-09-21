import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { authSecretKey } from "@/lib/session";

/**
 * The platform console's own session — separate from a shop login in every way
 * that matters:
 *
 *   - its own cookie (`rp_platform`), scoped to `path=/platform`, so the browser
 *     never even sends it to the shop app;
 *   - its own JWT audience, so a shop session token presented here — or this
 *     token presented to the shop app — fails verification outright (the shop
 *     verifier also demands a shop id and role this token does not carry);
 *   - a short life (8 hours) and `sameSite=strict`, because this session can
 *     read every shop on the platform.
 */

export const PLATFORM_COOKIE = "rp_platform";
const AUDIENCE = "repairpilot-platform";
const MAX_AGE = 60 * 60 * 8;

export type PlatformSession = { adminId: string; email: string; pv: number };

export async function signPlatformSession(session: PlatformSession): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: session.email, pv: session.pv, kind: "platform" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.adminId)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + MAX_AGE)
    .sign(authSecretKey());
}

export async function verifyPlatformSession(token: string | undefined | null): Promise<PlatformSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecretKey(), {
      algorithms: ["HS256"],
      audience: AUDIENCE,
    });
    if (payload.kind !== "platform" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { adminId: payload.sub, email: payload.email, pv: typeof payload.pv === "number" ? payload.pv : 0 };
  } catch {
    return null;
  }
}

export async function setPlatformCookie(session: PlatformSession): Promise<void> {
  const jar = await cookies();
  jar.set(PLATFORM_COOKIE, await signPlatformSession(session), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/platform",
    maxAge: MAX_AGE,
  });
}

export async function clearPlatformCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(PLATFORM_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/platform",
    maxAge: 0,
  });
}

export async function readPlatformCookie(): Promise<PlatformSession | null> {
  const jar = await cookies();
  return verifyPlatformSession(jar.get(PLATFORM_COOKIE)?.value);
}

/** Seconds since epoch of the last password change — a changed password ends older sessions. */
export function platformPasswordVersion(changedAt: Date): number {
  return Math.floor(changedAt.getTime() / 1000);
}
