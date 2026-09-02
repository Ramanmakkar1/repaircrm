"use server";

import { redirect } from "next/navigation";

import { audit } from "@/lib/audit";
import { completeSignIn, hashPassword, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  clearPending2faCookie,
  readPending2fa,
} from "@/lib/pending-2fa";
import {
  issueResetToken,
  resolveResetToken,
  sendResetEmail,
} from "@/lib/password-reset";
import { clearRateLimit, rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { setSessionCookie } from "@/lib/session";
import {
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} from "@/lib/totp";

/**
 * The signed-out half of account security: forgotten passwords, the reset link,
 * the second factor, and the forced password change after an invite.
 *
 * Everything here runs for a person who is NOT signed in (except the forced
 * change, which has a session but is allowed nowhere else), so the rules are
 * stricter than the rest of the app: no message may reveal whether an account
 * exists, and every entry point is throttled.
 */

export type SecurityFormState = {
  error?: string;
  message?: string;
} | undefined;

const MIN_PASSWORD = 8;

/** Five reset emails per address per quarter hour. */
const FORGOT_LIMIT = 5;
const FORGOT_WINDOW_MS = 15 * 60 * 1000;

/** Ten code attempts per account per quarter hour. */
const VERIFY_LIMIT = 10;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

/**
 * The one answer /forgot-password ever gives. Identical for a real account, an
 * unknown address, a deactivated user and a throttled requester — the whole
 * point is that the page cannot be used to find out who has an account here.
 */
const FORGOT_REPLY =
  "If that email exists, we sent a link. Check your inbox — it works for one hour.";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Shared by every screen that sets a password. */
function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

export async function forgotPasswordAction(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const email = field(formData, "email").toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter the email address you sign in with." };
  }

  const throttle = rateLimit(
    `forgot:${email}`,
    FORGOT_LIMIT,
    FORGOT_WINDOW_MS,
  );
  // Even the throttle answers with the standard reply: telling a stranger
  // "you have asked for this address five times" is itself an account oracle.
  if (!throttle.allowed) return { message: FORGOT_REPLY };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, shopId: true, active: true },
  });

  if (user?.active) {
    const issued = await issueResetToken(user.id);
    const status = await sendResetEmail({
      to: user.email,
      name: user.name,
      url: issued.url,
    });
    await audit({
      shopId: user.shopId,
      userId: user.id,
      action: "user.password_reset",
      entity: "user",
      entityId: user.id,
      summary: `Password reset link sent to ${user.email}`,
      meta: { stage: "requested", delivery: status },
    });
  }

  return { message: FORGOT_REPLY };
}

// ---------------------------------------------------------------------------
// Reset password (from the emailed link)
// ---------------------------------------------------------------------------

/**
 * Sets the new password, burns the token and signs the person in.
 *
 * `passwordChangedAt` is stamped in the same write, which is what invalidates
 * every session that was open before the reset (see lib/session-guard.ts) —
 * the whole reason someone resets a password they suspect is known.
 */
export async function resetPasswordAction(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  // The token rides in a hidden field rather than a bound argument, so this is
  // an ordinary (prevState, formData) action like every other one in the app —
  // and the form still works with JavaScript switched off.
  const resolved = await resolveResetToken(field(formData, "token"));
  if (!resolved) {
    return {
      error: "That link has expired or already been used. Request a new one.",
    };
  }

  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) return { error: problem };

  const changedAt = new Date();
  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    // usedAt is set with the token still unused in the where clause, so two
    // simultaneous submits cannot both consume the same link.
    const burned = await tx.passwordResetToken.updateMany({
      where: { id: resolved.tokenId, usedAt: null },
      data: { usedAt: changedAt },
    });
    if (burned.count === 0) return null;

    return tx.user.update({
      where: { id: resolved.userId },
      data: {
        passwordHash,
        passwordChangedAt: changedAt,
        mustChangePassword: false,
      },
      select: {
        id: true,
        shopId: true,
        role: true,
        name: true,
        email: true,
        passwordChangedAt: true,
      },
    });
  });

  if (!user) {
    return {
      error: "That link has expired or already been used. Request a new one.",
    };
  }

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.password_reset",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} set a new password from an emailed link`,
    meta: { stage: "completed" },
  });

  await completeSignIn(user);
  redirect("/");
}

// ---------------------------------------------------------------------------
// Two-factor verification at sign-in
// ---------------------------------------------------------------------------

export async function verifyTwoFactorAction(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const userId = await readPending2fa();
  if (!userId) {
    return { error: "That took too long — sign in with your password again." };
  }

  const entered = field(formData, "code");
  if (!entered) return { error: "Enter the code from your authenticator app." };

  const throttleKey = `2fa:${userId}`;
  const throttle = rateLimit(throttleKey, VERIFY_LIMIT, VERIFY_WINDOW_MS);
  if (!throttle.allowed) {
    return {
      error: `Too many attempts. Try again ${retryAfterLabel(throttle.retryAfterMs)}.`,
    };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      shopId: true,
      role: true,
      name: true,
      email: true,
      active: true,
      passwordChangedAt: true,
      totpSecret: true,
      totpEnabledAt: true,
      totpRecoveryCodes: true,
    },
  });

  if (!user || !user.active || !user.totpEnabledAt || !user.totpSecret) {
    await clearPending2faCookie();
    return { error: "Sign in with your password again." };
  }

  let via: "totp" | "recovery_code" | null = null;

  if (verifyTotp(user.totpSecret, entered)) {
    via = "totp";
  } else {
    // A recovery code is spent on use — removed from the array in the same
    // write, so a code that leaks after it was used opens nothing.
    const digest = hashRecoveryCode(entered);
    if (
      normalizeRecoveryCode(entered).length === 9 &&
      user.totpRecoveryCodes.includes(digest)
    ) {
      await db.user.update({
        where: { id: user.id },
        data: {
          totpRecoveryCodes: user.totpRecoveryCodes.filter((h) => h !== digest),
        },
      });
      via = "recovery_code";
    }
  }

  if (!via) {
    return { error: "That code isn't right. Check the app and try again." };
  }

  clearRateLimit(throttleKey);
  await clearPending2faCookie();

  if (via === "recovery_code") {
    await audit({
      shopId: user.shopId,
      userId: user.id,
      action: "user.login",
      entity: "user",
      entityId: user.id,
      summary: `${user.name} signed in with a recovery code`,
      meta: { remaining: user.totpRecoveryCodes.length - 1 },
    });
  }

  await completeSignIn(user, { via });

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

// ---------------------------------------------------------------------------
// Forced password change (a fresh invite, or an owner-imposed rotation)
// ---------------------------------------------------------------------------

export async function forcedPasswordChangeAction(
  _prev: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const session = await requireUser();

  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) return { error: problem };

  const changedAt = new Date();
  const user = await db.user.update({
    where: { id: session.userId },
    data: {
      passwordHash: await hashPassword(password),
      passwordChangedAt: changedAt,
      mustChangePassword: false,
    },
    select: {
      id: true,
      shopId: true,
      role: true,
      name: true,
      email: true,
      passwordChangedAt: true,
    },
  });

  // Re-issue this browser's cookie with the new `pv`, or the guard that just
  // sent them here would sign them straight back out.
  await setSessionCookie({
    userId: user.id,
    shopId: user.shopId,
    role: user.role,
    name: user.name,
    email: user.email,
    pv: Math.floor(changedAt.getTime() / 1000),
  });

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.password_changed",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} set a new password`,
    meta: { forced: true },
  });

  redirect("/");
}
