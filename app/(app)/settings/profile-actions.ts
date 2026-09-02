"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import { audit } from "@/lib/audit";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { unlinkGoogleFromUser } from "@/lib/google/account";
import { setSessionCookie } from "@/lib/session";
import {
  formatSecretForDisplay,
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "@/lib/totp";
import {
  settingsError,
  settingsSuccess,
  type SettingsFormState,
  type SettingsResult,
} from "@/components/settings/types";
import type {
  TotpEnableResult,
  TotpSetupResult,
} from "@/components/settings/profile-types";

/**
 * Settings → My profile.
 *
 * EVERY action here operates on `session.userId` and nothing else. There is no
 * user id parameter anywhere in this file by design: a technician editing their
 * own name and a technician editing the owner's name would otherwise be one
 * forged form field apart.
 *
 * Owner-level acts on OTHER people (reset someone's 2FA, change their role)
 * live in ./actions.ts where the role guard belongs.
 */

const MIN_PASSWORD = 8;

// ---------------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------------

export async function updateProfileNameAction(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireUser();

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (name.length < 2) return settingsError("Enter your name.");

  const user = await db.user.update({
    where: { id: session.userId },
    data: { name },
    select: {
      id: true,
      shopId: true,
      role: true,
      name: true,
      email: true,
      passwordChangedAt: true,
    },
  });

  // The name is baked into the session cookie (it renders in the app shell),
  // so the cookie is re-issued rather than left showing the old one.
  await setSessionCookie({
    userId: user.id,
    shopId: user.shopId,
    role: user.role,
    name: user.name,
    email: user.email,
    pv: user.passwordChangedAt
      ? Math.floor(user.passwordChangedAt.getTime() / 1000)
      : 0,
  });

  revalidatePath("/", "layout");
  return settingsSuccess("Your name has been updated.");
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/**
 * Changing a password signs every OTHER browser out: `passwordChangedAt` moves
 * forward, and lib/session-guard.ts refuses any session issued before it. This
 * browser gets a re-issued cookie so the person who just typed the password is
 * the one who stays in.
 */
export async function changeOwnPasswordAction(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireUser();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < MIN_PASSWORD) {
    return settingsError(`Use at least ${MIN_PASSWORD} characters.`);
  }
  if (next !== confirm) return settingsError("The two passwords don't match.");

  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return settingsError("Your account could not be loaded.");

  if (!(await verifyPassword(current, user.passwordHash))) {
    return settingsError("That current password isn't right.");
  }
  if (await verifyPassword(next, user.passwordHash)) {
    return settingsError("Pick a password you haven't used here before.");
  }

  const changedAt = new Date();
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(next),
      passwordChangedAt: changedAt,
      mustChangePassword: false,
      // They have now chosen a password of their own, so "Disconnect Google"
      // is no longer a way to lock themselves out.
      hasPassword: true,
    },
    select: { id: true, shopId: true, role: true, name: true, email: true },
  });

  await setSessionCookie({
    userId: updated.id,
    shopId: updated.shopId,
    role: updated.role,
    name: updated.name,
    email: updated.email,
    pv: Math.floor(changedAt.getTime() / 1000),
  });

  await audit({
    shopId: updated.shopId,
    userId: updated.id,
    action: "user.password_changed",
    entity: "user",
    entityId: updated.id,
    summary: `${updated.name} changed their password`,
  });

  revalidatePath("/settings");
  return settingsSuccess(
    "Password updated. Any other device signed in as you has been signed out.",
  );
}

// ---------------------------------------------------------------------------
// Two-step verification
// ---------------------------------------------------------------------------

/**
 * Step one: mint a secret, store it, and hand back the QR.
 *
 * The secret is written now but `totpEnabledAt` stays null, so nothing is
 * enforced yet — an abandoned setup leaves an unused secret that the next
 * attempt simply replaces. Re-running while 2FA is already on is refused, so a
 * stale dialog cannot silently swap a working authenticator.
 */
export async function startTotpSetupAction(): Promise<TotpSetupResult> {
  const session = await requireUser();

  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { email: true, totpEnabledAt: true },
  });
  if (!user) return { ok: false, error: "Your account could not be loaded." };
  if (user.totpEnabledAt) {
    return { ok: false, error: "Two-step verification is already on." };
  }

  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: session.userId },
    data: { totpSecret: secret },
  });

  const uri = otpauthUrl(user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 232,
    color: { dark: "#18181b", light: "#ffffff" },
  });

  return {
    ok: true,
    setup: {
      manualKey: formatSecretForDisplay(secret),
      otpauthUrl: uri,
      qrDataUrl,
    },
  };
}

/**
 * Step two: a code from the app proves the secret arrived, so 2FA goes live and
 * eight recovery codes are minted. Only their sha256 is stored — the plaintext
 * in this response is the only copy that will ever exist.
 */
export async function confirmTotpAction(
  code: string,
): Promise<TotpEnableResult> {
  const session = await requireUser();

  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { id: true, name: true, shopId: true, totpSecret: true, totpEnabledAt: true },
  });
  if (!user) return { ok: false, error: "Your account could not be loaded." };
  if (user.totpEnabledAt) {
    return { ok: false, error: "Two-step verification is already on." };
  }
  if (!user.totpSecret) {
    return { ok: false, error: "Start the setup again to get a fresh code." };
  }
  if (!verifyTotp(user.totpSecret, code)) {
    return { ok: false, error: "That code isn't right. Try the next one." };
  }

  const recovery = generateRecoveryCodes();
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpRecoveryCodes: recovery.hashes },
  });

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.2fa_enabled",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} turned on two-step verification`,
  });

  revalidatePath("/settings");
  return { ok: true, codes: recovery.codes };
}

/**
 * Turning 2FA off is a downgrade of the account's security, so it costs the
 * current password — otherwise a borrowed unlocked laptop is enough.
 */
export async function disableTotpAction(
  password: string,
): Promise<SettingsResult> {
  const session = await requireUser();

  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: {
      id: true,
      name: true,
      shopId: true,
      passwordHash: true,
      totpEnabledAt: true,
    },
  });
  if (!user) return { ok: false, error: "Your account could not be loaded." };
  if (!user.totpEnabledAt) {
    return { ok: false, error: "Two-step verification is already off." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "That password isn't right." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: [] },
  });

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.2fa_disabled",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} turned off two-step verification`,
  });

  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sign in with Google
// ---------------------------------------------------------------------------

/**
 * Settings → My profile → "Disconnect".
 *
 * Connecting is a GET to /api/auth/google/start?intent=link — it has to be, it
 * ends at Google — so only the disconnect half is an action. Both operate on
 * `session.userId` and nothing else, like everything in this file.
 */
export async function disconnectGoogleAction(): Promise<SettingsResult> {
  const session = await requireUser();
  const result = await unlinkGoogleFromUser(session);
  if (!result.ok) return result;

  revalidatePath("/settings");
  return { ok: true };
}
