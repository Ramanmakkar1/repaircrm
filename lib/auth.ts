import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  type SessionRole,
  type SessionUser,
} from "@/lib/session";

export type { SessionRole, SessionUser };

const BCRYPT_ROUNDS = 10;

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
}): Promise<void> {
  await setSessionCookie({
    userId: user.id,
    shopId: user.shopId,
    role: user.role,
    name: user.name,
    email: user.email,
  });
}

/** Clears the `rf_session` cookie. Server Action / Route Handler only. */
export async function destroySession(): Promise<void> {
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
 * Verifies credentials and, on success, issues the session cookie.
 * Returns a generic error for unknown-email / bad-password / disabled-account
 * so the response cannot be used to enumerate accounts.
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResult> {
  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
  });

  // Compare against a dummy hash when the user is missing so the timing of a
  // bad email matches the timing of a bad password.
  const hash =
    user?.passwordHash ??
    "$2b$10$0000000000000000000000000000000000000000000000000000";
  const valid = await verifyPassword(parsed.data.password, hash);

  if (!user || !valid || !user.active) {
    return { ok: false, error: "Incorrect email or password." };
  }

  const session: SessionUser = {
    userId: user.id,
    shopId: user.shopId,
    role: user.role,
    name: user.name,
    email: user.email,
  };
  await setSessionCookie(session);
  return { ok: true, user: session };
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

  const session: SessionUser = {
    userId: user.id,
    shopId: user.shopId,
    role: user.role,
    name: user.name,
    email: user.email,
  };
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
