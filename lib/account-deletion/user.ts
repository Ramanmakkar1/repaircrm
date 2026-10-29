import { unusablePasswordHash } from "@/lib/auth";
import { db } from "@/lib/db";
import { DELETED_USER_NAME, deletedUserEmail } from "./config";
import { sendLoginDeletedEmail } from "./email";

/**
 * Deleting ONE login: the person's own.
 *
 * ANONYMISE, DON'T DELETE. A User row is referenced from all over a shop's
 * books. Most of those relations are `SetNull` (tickets assigned, comments,
 * payments/deposits/refunds taken, stock and credit adjustments, attachments,
 * appointments, purchase orders, audit rows) and would merely lose their name,
 * but three CASCADE — TimeEntry, TimeClockEntry and CashDrawerSession.openedBy
 * — so a hard delete would erase the shop's billed labour, payroll hours and
 * cash-drawer counts. The shop owns those records; the person does not.
 *
 * So the row stays, as "Deleted user", and everything that identifies or
 * authenticates the person is removed:
 *
 *   wiped on the row   name, email (-> deleted+<id>@deleted.invalid), password
 *                      hash (-> unusable), 2FA secret and recovery codes, PIN,
 *                      Google sub/email/avatar, default location, last login
 *   switched off       active = false, role = TECH (never counts as an owner),
 *                      passwordChangedAt = now (every JWT is stale)
 *   rows deleted       push subscriptions, saved views, scanner pairings,
 *                      password-reset tokens, email sign-in codes
 *   scrubbed elsewhere ProductFeedback.email for feedback they sent
 *   kept, now showing  tickets, comments, time entries, clock-ins, drawers,
 *   "Deleted user"     payments, deposits, refunds, adjustments, audit rows
 *
 * SESSIONS. requireUser() re-reads the account on every request and redirects
 * an inactive one to /session-expired, so every other device is out on its
 * next click; the PIN version is rotated too, which ends PIN sessions.
 */

export type LoginDeletionBlock =
  | { blocked: false }
  | { blocked: true; reason: "last-owner" | "shop-pending" };

/**
 * The last owner can't delete just their login: a shop with nobody in charge
 * can't pay its bill, add staff or delete itself. They make someone else an
 * owner first, or delete the whole shop. Same when they are the only person
 * left — deleting the login would orphan the shop's data, so that is the shop
 * deletion instead.
 */
export async function loginDeletionBlock(user: {
  userId: string;
  shopId: string;
  role: string;
}): Promise<LoginDeletionBlock> {
  const shop = await db.shop.findUnique({
    where: { id: user.shopId },
    select: { deletionRequestedAt: true },
  });
  if (shop?.deletionRequestedAt) return { blocked: true, reason: "shop-pending" };
  if (user.role !== "OWNER") return { blocked: false };

  const otherOwners = await db.user.count({
    where: { shopId: user.shopId, role: "OWNER", active: true, NOT: { id: user.userId } },
  });
  return otherOwners > 0 ? { blocked: false } : { blocked: true, reason: "last-owner" };
}

export const LAST_OWNER_MESSAGE =
  "You're the only owner of this shop. Make someone else an owner in Settings → Team first, or delete the whole shop.";

/**
 * Anonymises the user. Call only after verifyIdentity() succeeded and
 * loginDeletionBlock() said no. Returns false when the row was not there.
 */
export async function anonymiseUser(user: { userId: string; shopId: string }): Promise<boolean> {
  const { userId, shopId } = user;
  if (!userId || !shopId) throw new Error("anonymiseUser needs both a userId and a shopId.");

  const before = await db.user.findFirst({
    where: { id: userId, shopId },
    select: { name: true, email: true, role: true, shop: { select: { name: true } } },
  });
  if (!before) return false;

  const now = new Date();
  const passwordHash = await unusablePasswordHash();

  await db.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: userId, shopId },
      data: {
        name: DELETED_USER_NAME,
        email: deletedUserEmail(userId),
        passwordHash,
        hasPassword: false,
        active: false,
        role: "TECH",
        mustChangePassword: false,
        passwordChangedAt: now,
        lastLoginAt: null,
        totpSecret: null,
        totpEnabledAt: null,
        totpRecoveryCodes: [],
        pinHash: null,
        pinVersion: crypto.randomUUID(),
        googleSub: null,
        googleEmail: null,
        googleLinkedAt: null,
        avatarUrl: null,
        defaultLocationId: null,
      },
    });
    await tx.pushSubscription.deleteMany({ where: { userId, shopId } });
    await tx.nativePushDevice.deleteMany({ where: { userId, shopId } });
    await tx.savedView.deleteMany({ where: { userId, shopId } });
    await tx.scanSession.deleteMany({ where: { userId, shopId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailAuthCode.deleteMany({ where: { userId } });
    await tx.productFeedback.updateMany({ where: { reporterUserId: userId }, data: { email: null } });
    // The person's name is deliberately NOT written into this row: the point is
    // that it is gone. The owner can still see that it happened, and when.
    await tx.auditLog.create({
      data: {
        shopId,
        userId,
        action: "user.deleted",
        entity: "user",
        entityId: userId,
        summary: `A team member deleted their own login (was ${roleWord(before.role)})`,
        meta: { via: "self" },
      },
    });
  });

  await sendLoginDeletedEmail({ to: before.email, name: before.name, shopName: before.shop.name });
  return true;
}

function roleWord(role: string): string {
  if (role === "OWNER") return "an owner";
  if (role === "FRONT_DESK") return "front desk";
  return "a technician";
}
