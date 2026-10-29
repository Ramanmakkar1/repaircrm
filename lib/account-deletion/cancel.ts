import { verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { hashRecoveryCode, normalizeRecoveryCode, verifyTotp } from "@/lib/totp";
import { cancelShopDeletion, resolveCancelToken } from "./shop";

/**
 * Cancelling from OUTSIDE the app. During the grace period nobody in the shop
 * can sign in (that is the point), so the two ways back are public:
 *
 *   1. the "Keep my shop" link emailed with the request, or
 *   2. an owner's email + password (+ authenticator code when 2FA is on) typed
 *      on /delete-account — for when the email never arrived.
 *
 * Only an owner whose login was switched off BY the deletion qualifies; one an
 * owner had disabled before stays out.
 */

const GENERIC = "We couldn't match that to an owner of a shop that's scheduled for deletion.";

export async function cancelWithCredentials(input: {
  email: string;
  password: string;
  totp?: string;
}): Promise<{ ok: true; shopName: string } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return { ok: false, error: "Enter your email and password." };

  const throttle = rateLimit(`deletion-cancel:${email}`, 10, 15 * 60 * 1000);
  if (!throttle.allowed) {
    return { ok: false, error: `Too many tries. Try again ${retryAfterLabel(throttle.retryAfterMs)}.` };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      shopId: true,
      role: true,
      passwordHash: true,
      hasPassword: true,
      totpSecret: true,
      totpEnabledAt: true,
      totpRecoveryCodes: true,
      shop: { select: { deletionRequestedAt: true, deletionSuspendedUserIds: true } },
    },
  });

  // Same timing for a missing account as for a wrong password.
  const hash = user?.passwordHash ?? "$2b$10$0000000000000000000000000000000000000000000000000000";
  const valid = await verifyPassword(input.password, hash);
  if (
    !user ||
    !valid ||
    !user.hasPassword ||
    user.role !== "OWNER" ||
    !user.shop.deletionRequestedAt ||
    !user.shop.deletionSuspendedUserIds.includes(user.id)
  ) {
    return { ok: false, error: GENERIC };
  }

  if (user.totpEnabledAt && user.totpSecret) {
    const entered = (input.totp ?? "").trim();
    if (!entered) return { ok: false, error: "This login uses two-step sign-in. Enter the code from your authenticator app too." };
    if (!verifyTotp(user.totpSecret, entered)) {
      const digest = hashRecoveryCode(entered);
      if (!(normalizeRecoveryCode(entered).length === 9 && user.totpRecoveryCodes.includes(digest))) {
        return { ok: false, error: "That authenticator code isn't right." };
      }
      await db.user.updateMany({
        where: { id: user.id, shopId: user.shopId },
        data: { totpRecoveryCodes: user.totpRecoveryCodes.filter((h) => h !== digest) },
      });
    }
  }

  return cancelShopDeletion({ shopId: user.shopId, actorUserId: user.id, via: "password" });
}

export async function cancelWithToken(token: string): Promise<{ ok: true; shopName: string } | { ok: false; error: string }> {
  const pending = await resolveCancelToken(token);
  if (!pending) {
    return { ok: false, error: "This link no longer works. The deletion may already be cancelled or finished." };
  }
  return cancelShopDeletion({ shopId: pending.shopId, actorUserId: null, via: "email-link" });
}
