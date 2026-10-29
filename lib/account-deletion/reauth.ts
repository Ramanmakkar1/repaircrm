import { verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyEmailCode } from "@/lib/email-code";
import { clearRateLimit, rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { hashRecoveryCode, normalizeRecoveryCode, verifyTotp } from "@/lib/totp";

/**
 * "Prove it is still you" before anything is deleted.
 *
 * A session alone is not enough: a till left signed in, or a phone picked up
 * off the bench, must not be able to erase a login or a shop. So:
 *
 *   - an account with a password types it again;
 *   - a Google-only account (hasPassword = false) has no password to type, so
 *     it proves control of its inbox with a one-time emailed code instead
 *     (the same codes "Email me a code" sign-in uses, lib/email-code.ts) —
 *     a fresh Google round trip would need a new intent in the Google flow,
 *     which lives outside this module;
 *   - an account with 2FA on also gives a current authenticator code, or one
 *     of its recovery codes (which is spent, as at sign-in).
 *
 * Ten tries per quarter hour per person, so the dialog is not a password
 * oracle for whoever is holding the device.
 */
export type ReauthInput = {
  password?: string;
  emailChallenge?: string;
  emailCode?: string;
  totp?: string;
};

export type ReauthResult = { ok: true } | { ok: false; error: string };

const LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function verifyIdentity(
  userId: string,
  shopId: string,
  input: ReauthInput,
): Promise<ReauthResult> {
  const key = `account-delete:${userId}`;
  const throttle = rateLimit(key, LIMIT, WINDOW_MS);
  if (!throttle.allowed) {
    return { ok: false, error: `Too many tries. Try again ${retryAfterLabel(throttle.retryAfterMs)}.` };
  }

  const user = await db.user.findFirst({
    where: { id: userId, shopId },
    select: {
      id: true,
      active: true,
      hasPassword: true,
      passwordHash: true,
      totpSecret: true,
      totpEnabledAt: true,
      totpRecoveryCodes: true,
    },
  });
  if (!user || !user.active) return { ok: false, error: "This login can no longer be used." };

  if (user.hasPassword) {
    const password = input.password ?? "";
    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      return { ok: false, error: "That password isn't right." };
    }
  } else {
    const challenge = input.emailChallenge ?? "";
    const code = (input.emailCode ?? "").replace(/\D/g, "");
    if (!challenge) return { ok: false, error: "Send yourself a code first, then type it in." };
    const owner = await verifyEmailCode(challenge, code, "login");
    if (!owner || owner.id !== user.id) {
      return { ok: false, error: "That code isn't right or has expired. Send a new one." };
    }
  }

  if (user.totpEnabledAt && user.totpSecret) {
    const entered = (input.totp ?? "").trim();
    if (!entered) return { ok: false, error: "Enter the code from your authenticator app." };
    if (!verifyTotp(user.totpSecret, entered)) {
      const digest = hashRecoveryCode(entered);
      const isRecovery =
        normalizeRecoveryCode(entered).length === 9 && user.totpRecoveryCodes.includes(digest);
      if (!isRecovery) return { ok: false, error: "That authenticator code isn't right." };
      await db.user.updateMany({
        where: { id: user.id, shopId },
        data: { totpRecoveryCodes: user.totpRecoveryCodes.filter((hash) => hash !== digest) },
      });
    }
  }

  clearRateLimit(key);
  return { ok: true };
}

/** What the confirm dialog needs to know to ask for the right proof. */
export async function reauthNeeds(
  userId: string,
  shopId: string,
): Promise<{ password: boolean; emailCode: boolean; totp: boolean }> {
  const user = await db.user.findFirst({
    where: { id: userId, shopId },
    select: { hasPassword: true, totpEnabledAt: true },
  });
  return {
    password: Boolean(user?.hasPassword),
    emailCode: user ? !user.hasPassword : false,
    totp: Boolean(user?.totpEnabledAt),
  };
}
