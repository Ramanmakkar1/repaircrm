import { SignJWT, jwtVerify } from "jose";

import { appUrl } from "@/lib/comms/config";
import { db } from "@/lib/db";
import { authSecretKey } from "@/lib/session";
import { deletionDateLabel, purgeAfterFrom } from "./config";
import { sendShopDeletionCancelledEmail, sendShopDeletionRequestedEmail } from "./email";

/**
 * Deleting a whole SHOP is scheduled, not immediate.
 *
 *   request   Stamp deletionRequestedAt / deletionPurgeAfter, switch off every
 *             active login and API key of the shop in the same transaction
 *             (remembering which), and email the owner a "Keep my shop" link.
 *             Every sign-in path (password, Google, email code, PIN switch,
 *             reset link) already refuses an inactive user, and requireUser()
 *             cuts off live sessions on their next request — so "block every
 *             sign-in at once" needs no change to the auth code.
 *   cancel    Within the window: clear the stamps and switch back on exactly
 *             the logins and keys that were switched off. Ones an owner had
 *             already disabled stay disabled.
 *   purge     lib/account-deletion/purge.ts, from the jobs runner.
 */

export type PendingDeletion = {
  shopId: string;
  shopName: string;
  requestedAt: Date;
  purgeAfter: Date;
  timezone: string;
};

export async function requestShopDeletion(input: {
  shopId: string;
  userId: string;
  now?: Date;
}): Promise<{ ok: true; pending: PendingDeletion } | { ok: false; error: string }> {
  const { shopId, userId } = input;
  if (!shopId || !userId) throw new Error("requestShopDeletion needs a shopId and a userId.");
  const now = input.now ?? new Date();
  const purgeAfter = purgeAfterFrom(now);

  const result = await db.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: { name: true, timezone: true, deletionRequestedAt: true },
    });
    if (!shop) return { ok: false as const, error: "That shop no longer exists." };
    if (shop.deletionRequestedAt) return { ok: false as const, error: "This shop is already scheduled for deletion." };

    const [users, keys] = await Promise.all([
      tx.user.findMany({ where: { shopId, active: true }, select: { id: true } }),
      tx.apiKey.findMany({ where: { shopId, active: true }, select: { id: true } }),
    ]);
    const userIds = users.map((u) => u.id);
    const keyIds = keys.map((k) => k.id);

    await tx.shop.update({
      where: { id: shopId },
      data: {
        deletionRequestedAt: now,
        deletionPurgeAfter: purgeAfter,
        deletionRequestedById: userId,
        deletionSuspendedUserIds: userIds,
        deletionSuspendedApiKeyIds: keyIds,
      },
    });
    if (userIds.length > 0) {
      await tx.user.updateMany({ where: { shopId, id: { in: userIds } }, data: { active: false } });
    }
    if (keyIds.length > 0) {
      await tx.apiKey.updateMany({ where: { shopId, id: { in: keyIds } }, data: { active: false } });
    }
    await tx.auditLog.create({
      data: {
        shopId,
        userId,
        action: "shop.deletion_requested",
        entity: "settings",
        entityId: shopId,
        summary: `Shop deletion requested; data will be deleted after ${purgeAfter.toISOString().slice(0, 10)}`,
        meta: { purgeAfter: purgeAfter.toISOString(), logins: userIds.length, apiKeys: keyIds.length },
      },
    });
    return {
      ok: true as const,
      pending: { shopId, shopName: shop.name, requestedAt: now, purgeAfter, timezone: shop.timezone },
    };
  });

  if (result.ok) {
    const requester = await db.user.findFirst({ where: { id: userId, shopId }, select: { name: true, email: true } });
    if (requester) {
      await sendShopDeletionRequestedEmail({
        to: requester.email,
        name: requester.name,
        shopName: result.pending.shopName,
        dateLabel: deletionDateLabel(result.pending.purgeAfter, result.pending.timezone),
        cancelUrl: await cancelUrl(shopId, now),
      });
    }
  }
  return result;
}

/**
 * Undo a pending deletion. `actorUserId` is the owner who proved who they are
 * (or the requester, for the emailed link). Returns false when there was
 * nothing to cancel — already cancelled, already purged, or past the window
 * (the purge may be running).
 */
export async function cancelShopDeletion(input: {
  shopId: string;
  actorUserId: string | null;
  via: "password" | "email-link";
  now?: Date;
}): Promise<{ ok: true; shopName: string } | { ok: false; error: string }> {
  const { shopId } = input;
  if (!shopId) throw new Error("cancelShopDeletion needs a shopId.");
  const now = input.now ?? new Date();

  const result = await db.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: {
        name: true,
        deletionRequestedAt: true,
        deletionPurgeAfter: true,
        deletionRequestedById: true,
        deletionSuspendedUserIds: true,
        deletionSuspendedApiKeyIds: true,
      },
    });
    if (!shop?.deletionRequestedAt) {
      return { ok: false as const, error: "This shop isn't scheduled for deletion." };
    }
    if (shop.deletionPurgeAfter && shop.deletionPurgeAfter <= now) {
      return {
        ok: false as const,
        error: "The grace period has ended and the shop is being deleted. Email support straight away if this is a mistake.",
      };
    }

    // Conditional on the stamp still being there, so two cancels (or a cancel
    // racing the purge's claim) cannot both act.
    const cleared = await tx.shop.updateMany({
      where: { id: shopId, deletionRequestedAt: shop.deletionRequestedAt },
      data: {
        deletionRequestedAt: null,
        deletionPurgeAfter: null,
        deletionRequestedById: null,
        deletionSuspendedUserIds: [],
        deletionSuspendedApiKeyIds: [],
      },
    });
    if (cleared.count === 0) return { ok: false as const, error: "This shop isn't scheduled for deletion." };

    if (shop.deletionSuspendedUserIds.length > 0) {
      await tx.user.updateMany({
        where: { shopId, id: { in: shop.deletionSuspendedUserIds } },
        data: { active: true },
      });
    }
    if (shop.deletionSuspendedApiKeyIds.length > 0) {
      await tx.apiKey.updateMany({
        where: { shopId, id: { in: shop.deletionSuspendedApiKeyIds } },
        data: { active: true },
      });
    }
    await tx.auditLog.create({
      data: {
        shopId,
        userId: input.actorUserId,
        action: "shop.deletion_cancelled",
        entity: "settings",
        entityId: shopId,
        summary: "Shop deletion cancelled; logins and API keys switched back on",
        meta: { via: input.via },
      },
    });
    return { ok: true as const, shopName: shop.name, notifyUserId: input.actorUserId ?? shop.deletionRequestedById };
  });

  if (!result.ok) return result;
  if (result.notifyUserId) {
    const person = await db.user.findFirst({
      where: { id: result.notifyUserId, shopId },
      select: { name: true, email: true },
    });
    if (person) await sendShopDeletionCancelledEmail({ to: person.email, name: person.name, shopName: result.shopName });
  }
  return { ok: true, shopName: result.shopName };
}

export async function pendingDeletion(shopId: string): Promise<PendingDeletion | null> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true, timezone: true, deletionRequestedAt: true, deletionPurgeAfter: true },
  });
  if (!shop?.deletionRequestedAt || !shop.deletionPurgeAfter) return null;
  return {
    shopId,
    shopName: shop.name,
    requestedAt: shop.deletionRequestedAt,
    purgeAfter: shop.deletionPurgeAfter,
    timezone: shop.timezone,
  };
}

// ---------------------------------------------------------------------------
// The emailed "Keep my shop" link
// ---------------------------------------------------------------------------

/**
 * A signed, single-purpose token: the shop and the instant of THIS request.
 * It only works while that exact request is pending, so a link from an earlier
 * request that was cancelled cannot cancel a later one. Opening it shows a
 * button; nothing changes on GET (mail scanners follow links).
 */
const CANCEL_KIND = "shop-deletion-cancel";

export async function signCancelToken(shopId: string, requestedAt: Date): Promise<string> {
  return new SignJWT({ kind: CANCEL_KIND, shopId, at: requestedAt.getTime() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("120d")
    .sign(authSecretKey());
}

export async function cancelUrl(shopId: string, requestedAt: Date): Promise<string> {
  return `${appUrl()}/delete-account?keep=${encodeURIComponent(await signCancelToken(shopId, requestedAt))}`;
}

/** The pending deletion a token points at, or null if it is stale, forged or done. */
export async function resolveCancelToken(token: string | null | undefined): Promise<PendingDeletion | null> {
  if (!token || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, authSecretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== CANCEL_KIND || typeof payload.shopId !== "string" || typeof payload.at !== "number") return null;
    const pending = await pendingDeletion(payload.shopId);
    if (!pending || pending.requestedAt.getTime() !== payload.at) return null;
    return pending;
  } catch {
    return null;
  }
}
