import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { setPending2faCookie } from "@/lib/pending-2fa";
import { clearRateLimit, rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  type SessionRole,
  type SessionUser,
} from "@/lib/session";

export type { SessionRole, SessionUser };

const BCRYPT_ROUNDS = 10;

/**
 * Login throttle: ten tries per email per quarter hour.
 *
 * Keyed on the email rather than the IP because a shop is one NAT'd office —
 * limiting the address would lock out the front desk when a technician
 * fat-fingers their own password.
 */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Issues the `rf_session` cookie. Server Action / Route Handler only. */
export async function createSession(user: {
  id: string;
  shopId: string;
  role: SessionRole;
  name: string;
  email: string;
  passwordChangedAt?: Date | null;
}): Promise<void> {
  await setSessionCookie(sessionFor(user));
}

/**
 * `User.passwordChangedAt` as the epoch seconds the session carries as `pv`.
 * Zero when the password has never been changed, which is what a fresh signup
 * and every pre-Wave-8 row look like.
 */
export function passwordVersion(passwordChangedAt: Date | null | undefined): number {
  return passwordChangedAt ? Math.floor(passwordChangedAt.getTime() / 1000) : 0;
}

/** The session payload for a user row. One place, so `pv` is never forgotten. */
export function sessionFor(user: {
  id: string;
  shopId: string;
  role: SessionRole;
  name: string;
  email: string;
  passwordChangedAt?: Date | null;
}): SessionUser {
  return {
    userId: user.id,
    shopId: user.shopId,
    role: user.role,
    name: user.name,
    email: user.email,
    pv: passwordVersion(user.passwordChangedAt),
  };
}

/**
 * The last step of every successful sign-in, whether it needed a second factor
 * or not: issue the cookie, stamp `lastLoginAt`, and record it in the audit log.
 *
 * Kept in one function so the plain path and the 2FA path can never disagree
 * about what "signed in" means.
 */
export async function completeSignIn(user: {
  id: string;
  shopId: string;
  role: SessionRole;
  name: string;
  email: string;
  passwordChangedAt?: Date | null;
}, options: { via?: "password" | "totp" | "recovery_code" } = {}): Promise<SessionUser> {
  const session = sessionFor(user);
  await setSessionCookie(session);

  // A failed stamp must not cost the user their sign-in.
  await db.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => undefined);

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.login",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} signed in`,
    meta: { via: options.via ?? "password" },
  });

  return session;
}

/** Clears the `rf_session` cookie. Server Action / Route Handler only. */
export async function destroySession(): Promise<void> {
  await clearSessionCookie();
}

/**
 * Sign-out, with the audit row. Every "Sign out" affordance goes through this
 * so the trail does not depend on which one the operator happened to click.
 */
export async function signOutCurrentUser(): Promise<void> {
  const session = await getSession();
  if (session) {
    await audit({
      shopId: session.shopId,
      userId: session.userId,
      action: "user.logout",
      entity: "user",
      entityId: session.userId,
      summary: `${session.name} signed out`,
    });
  }
  await clearSessionCookie();
}

/**
 * Returns the current session, or null when signed out.
 * Safe to call anywhere on the server (layouts, pages, actions).
 */
export async function getSession(): Promise<SessionUser | null> {
  return readSessionCookie();
}

/**
 * Returns the current session, redirecting to /login when signed out.
 * This is the guard every authenticated page/layout should call.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Role guard. Redirects to the dashboard when the role is not permitted. */
export async function requireRole(
  ...roles: SessionRole[]
): Promise<SessionUser> {
  const session = await requireUser();
  if (!roles.includes(session.role)) redirect("/");
  return session;
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------------------------------------------------------------------------
// Login / signup
// ---------------------------------------------------------------------------

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

/** Trims + lowercases, then validates. Emails are stored lowercase. */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name is required"),
  name: z.string().trim().min(2, "Your name is required"),
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * What a sign-in attempt can end as.
 *
 * `"2fa"` is the interesting one: the password was right, but the account has an
 * authenticator on it, so NO session was issued. A five-minute pending cookie
 * was set instead and the caller must send the person to /login/verify.
 */
export type LoginOutcome =
  | { status: "ok"; user: SessionUser }
  | { status: "2fa" }
  | { status: "error"; error: string };

/**
 * Verifies credentials and, when nothing else is required, issues the session.
 *
 * Returns one generic error for unknown-email / bad-password / disabled-account
 * so the response cannot be used to enumerate accounts. Attempts are throttled
 * per email; hitting the ceiling is the one thing that lands in the audit log,
 * because a single mistyped password is noise and fifteen of them are not.
 */
export async function login(
  email: string,
  password: string
): Promise<LoginOutcome> {
  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return {
      status: "error",
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const throttleKey = `login:${parsed.data.email}`;
  const throttle = rateLimit(throttleKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!throttle.allowed) {
    // Recorded once, on the attempt that crosses the line — not on every
    // attempt after it, or a bot would write the audit log for us.
    if (throttle.count === LOGIN_LIMIT + 1 && user) {
      await audit({
        shopId: user.shopId,
        userId: user.id,
        action: "user.login_locked",
        entity: "user",
        entityId: user.id,
        summary: `Too many failed sign-in attempts for ${user.email}`,
        meta: { attempts: throttle.count, windowMinutes: LOGIN_WINDOW_MS / 60_000 },
      });
    }
    return {
      status: "error",
      error: `Too many sign-in attempts. Try again ${retryAfterLabel(throttle.retryAfterMs)}.`,
    };
  }

  // Compare against a dummy hash when the user is missing so the timing of a
  // bad email matches the timing of a bad password.
  const hash =
    user?.passwordHash ??
    "$2b$10$0000000000000000000000000000000000000000000000000000";
  const valid = await verifyPassword(parsed.data.password, hash);

  if (!user || !valid || !user.active) {
    return { status: "error", error: "Incorrect email or password." };
  }

  // The password was right, so this browser is not the one being brute-forced.
  clearRateLimit(throttleKey);

  // Second factor outstanding: no session yet, just a short-lived marker.
  if (user.totpEnabledAt) {
    await setPending2faCookie(user.id);
    return { status: "2fa" };
  }

  return { status: "ok", user: await completeSignIn(user) };
}

/**
 * Creates a brand new tenant: Shop + a "Main" Location + an OWNER user,
 * then signs that owner in. All three rows are written in one transaction so a
 * half-created shop can never exist.
 */
export async function signup(input: {
  shopName: string;
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const slug = await uniqueShopSlug(parsed.data.shopName);

  const user = await db.$transaction(async (tx) => {
    const shop = await tx.shop.create({
      data: {
        name: parsed.data.shopName,
        slug,
        email,
      },
    });

    await tx.location.create({
      data: { shopId: shop.id, name: "Main", isDefault: true },
    });

    return tx.user.create({
      data: {
        shopId: shop.id,
        email,
        passwordHash,
        name: parsed.data.name,
        role: "OWNER",
      },
    });
  });

  const session = sessionFor(user);
  await setSessionCookie(session);
  return { ok: true, user: session };
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "shop"
  );
}

async function uniqueShopSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const taken = await db.shop.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}
