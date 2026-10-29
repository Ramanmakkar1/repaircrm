"use server";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestEmailCode } from "@/lib/email-code";
import { clearSessionCookie } from "@/lib/session";
import { shopNameMatches, type DeletionResult } from "@/lib/account-deletion/config";
import { verifyIdentity, type ReauthInput } from "@/lib/account-deletion/reauth";
import { requestShopDeletion } from "@/lib/account-deletion/shop";
import { LAST_OWNER_MESSAGE, anonymiseUser, loginDeletionBlock } from "@/lib/account-deletion/user";

/**
 * Account deletion actions. Every refusal is RETURNED as `{ ok: false, error }`:
 * Next replaces a thrown error's message with a generic one in production, and
 * "that password isn't right" is the whole point of the answer.
 */

function proof(input: unknown): ReauthInput {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string).slice(0, 512) : undefined);
  return {
    password: text("password"),
    emailChallenge: text("emailChallenge"),
    emailCode: text("emailCode"),
    totp: text("totp"),
  };
}

/** Google-only logins prove themselves with an emailed code. */
export async function sendDeletionCodeAction(): Promise<{ ok: true; challenge: string } | { ok: false; error: string }> {
  const session = await requireUser();
  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { email: true, hasPassword: true },
  });
  if (!user) return { ok: false, error: "This login can no longer be used." };
  if (user.hasPassword) return { ok: false, error: "Use your password to confirm instead." };
  const challenge = await requestEmailCode(user.email, "login");
  return { ok: true, challenge };
}

export async function deleteMyLoginAction(input: unknown): Promise<DeletionResult> {
  const session = await requireUser();

  const block = await loginDeletionBlock(session);
  if (block.blocked) {
    return {
      ok: false,
      error: block.reason === "last-owner" ? LAST_OWNER_MESSAGE : "This shop is scheduled for deletion.",
    };
  }

  const verified = await verifyIdentity(session.userId, session.shopId, proof(input));
  if (!verified.ok) return verified;

  const done = await anonymiseUser(session);
  if (!done) return { ok: false, error: "This login can no longer be used." };

  await clearSessionCookie();
  return { ok: true, redirectTo: "/delete-account?done=login" };
}

export async function requestShopDeletionAction(input: unknown): Promise<DeletionResult> {
  const session = await requireUser();
  if (session.role !== "OWNER") return { ok: false, error: "Only an owner can delete the shop." };

  const typed =
    input && typeof input === "object" && typeof (input as { shopName?: unknown }).shopName === "string"
      ? (input as { shopName: string }).shopName
      : "";
  const shop = await db.shop.findUnique({ where: { id: session.shopId }, select: { name: true } });
  if (!shop) return { ok: false, error: "That shop no longer exists." };
  if (!shopNameMatches(typed, shop.name)) {
    return { ok: false, error: `Type the shop name exactly as shown: ${shop.name}` };
  }

  const verified = await verifyIdentity(session.userId, session.shopId, proof(input));
  if (!verified.ok) return verified;

  const result = await requestShopDeletion({ shopId: session.shopId, userId: session.userId });
  if (!result.ok) return result;

  await clearSessionCookie();
  return { ok: true, redirectTo: "/delete-account?scheduled=1" };
}
