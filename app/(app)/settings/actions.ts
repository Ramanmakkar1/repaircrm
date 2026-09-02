"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import crypto from "node:crypto";

import { audit } from "@/lib/audit";
import { hashPassword, requireUser } from "@/lib/auth";
import { emailDriverName } from "@/lib/comms/config";
import { db } from "@/lib/db";
import { parseBps } from "@/lib/money";
import {
  INVITE_TTL_MS,
  issueResetToken,
  sendInviteEmail,
} from "@/lib/password-reset";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import {
  settingsError,
  settingsSuccess,
  type InviteResult,
  type SettingsFormState,
  type SettingsResult,
} from "@/components/settings/types";

/**
 * Settings mutations.
 *
 * Every action re-derives `shopId` (and the acting role) from the session —
 * never from the form — so a hand-rolled POST cannot retitle another tenant's
 * shop or promote itself to OWNER.
 *
 * ROLE RULES
 *   Shop / Workflow / Team          OWNER only
 *   Canned responses                OWNER + FRONT_DESK
 *   Messaging                       read-only, no action at all
 */

const MAX_LIST_ITEMS = 40;
const MAX_ITEM_LENGTH = 60;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * `requireRole` redirects, which is right for a page but wrong inside an action
 * the client is awaiting a result from — a redirect there surfaces as an opaque
 * failure. These return an error the caller can render instead.
 */
async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") return { session, denied: "Only an owner can change this." };
  return { session, denied: null as string | null };
}

async function cannedManager() {
  const session = await requireUser();
  if (session.role !== "OWNER" && session.role !== "FRONT_DESK") {
    return { session, denied: "Only an owner or front desk can manage canned responses." };
  }
  return { session, denied: null as string | null };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string, max = 200): string | null {
  const value = text(formData, key).slice(0, max);
  return value === "" ? null : value;
}

// ---------------------------------------------------------------------------
// Tab 1 — Shop
// ---------------------------------------------------------------------------

export async function updateShopAction(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { session, denied } = await ownerOnly();
  if (denied) return settingsError(denied);

  const name = text(formData, "name").slice(0, 120);
  if (name.length < 2) return settingsError("The shop needs a name.");

  const email = text(formData, "email");
  if (email && !z.email().safeParse(email).success) {
    return settingsError("That shop email address is not valid.");
  }

  // The input is a percentage the way a human writes it ("8.25"); the column is
  // basis points. Anything outside 0–100% is a typo, not a tax rate.
  const taxRateBps = parseBps(text(formData, "taxRate"));
  if (taxRateBps < 0 || taxRateBps > 10_000) {
    return settingsError("Enter a tax rate between 0 and 100%.");
  }

  await db.shop.update({
    where: { id: session.shopId },
    data: {
      name,
      address1: optional(formData, "address1"),
      address2: optional(formData, "address2"),
      city: optional(formData, "city", 80),
      state: optional(formData, "state", 80),
      postalCode: optional(formData, "postalCode", 20),
      country: text(formData, "country").slice(0, 60) || "US",
      phone: optional(formData, "phone", 40),
      email: email || null,
      timezone: text(formData, "timezone").slice(0, 60) || "America/Edmonton",
      taxRateBps,
    },
  });

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "settings.updated",
    entity: "settings",
    entityId: session.shopId,
    summary: "Shop details and billing defaults saved",
    meta: { section: "shop", taxRateBps },
  });

  // The shop block appears on every printed document and the app shell.
  revalidatePath("/", "layout");
  return settingsSuccess("Shop details saved.");
}

// ---------------------------------------------------------------------------
// Tab 2 — Workflow (Shop.settings JSON)
// ---------------------------------------------------------------------------

/**
 * Trim, drop blanks, de-duplicate case-insensitively, cap the size.
 * Order is the operator's — it is the order the pickers render in.
 */
function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const value = raw.trim().slice(0, MAX_ITEM_LENGTH);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

/**
 * Writes `patch` into `Shop.settings` WITHOUT discarding keys this screen does
 * not know about. `settings` is a shared Json blob — a future feature storing
 * its own key here must not be wiped by someone renaming a problem type.
 */
function mergeSettings(
  current: Prisma.JsonValue | null | undefined,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

export async function updateWorkflowAction(input: {
  problemTypes: string[];
  ticketStatuses: string[];
}): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const problemTypes = cleanList(input.problemTypes);
  let ticketStatuses = cleanList(input.ticketStatuses);

  if (problemTypes.length === 0) {
    return { ok: false, error: "Keep at least one problem type." };
  }
  if (ticketStatuses.length === 0) {
    return { ok: false, error: "Keep at least one ticket status." };
  }

  // components/tickets/ticket-meta.ts treats RESOLVED_STATUS as the terminal
  // state — staleness, the resolved timestamp and the closed-ticket counts all
  // key off it. Losing it would quietly break those, so it is re-added rather
  // than refused. The UI blocks removing it too; this is the backstop.
  if (!ticketStatuses.some((s) => s.toLowerCase() === RESOLVED_STATUS.toLowerCase())) {
    ticketStatuses = [...ticketStatuses, RESOLVED_STATUS];
  }

  const shop = await db.shop.findUnique({
    where: { id: session.shopId },
    select: { settings: true },
  });
  if (!shop) return { ok: false, error: "Shop not found." };

  await db.shop.update({
    where: { id: session.shopId },
    data: { settings: mergeSettings(shop.settings, { problemTypes, ticketStatuses }) },
  });

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "settings.updated",
    entity: "settings",
    entityId: session.shopId,
    summary: "Problem types and ticket statuses saved",
    meta: {
      section: "workflow",
      problemTypes: problemTypes.length,
      ticketStatuses: ticketStatuses.length,
    },
  });

  // Both lists feed the ticket pickers and the board columns.
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tab 3 — Canned responses
// ---------------------------------------------------------------------------

export async function saveCannedResponseAction(input: {
  id?: string | null;
  title: string;
  body: string;
}): Promise<SettingsResult> {
  const { session, denied } = await cannedManager();
  if (denied) return { ok: false, error: denied };

  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 5000);
  if (!title) return { ok: false, error: "Give the response a title." };
  if (!body) return { ok: false, error: "Write the message body." };

  if (input.id) {
    // updateMany with the shop filter — a forged id from another tenant simply
    // matches nothing rather than editing their row.
    const updated = await db.cannedResponse.updateMany({
      where: { id: input.id, shopId: session.shopId },
      data: { title, body },
    });
    if (updated.count === 0) {
      return { ok: false, error: "That canned response no longer exists." };
    }
  } else {
    await db.cannedResponse.create({
      data: { shopId: session.shopId, title, body },
    });
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteCannedResponseAction(
  id: string,
): Promise<SettingsResult> {
  const { session, denied } = await cannedManager();
  if (denied) return { ok: false, error: denied };

  // Prisma treats `id: undefined` as "no filter" — without this guard a
  // malformed call would delete every canned response in the shop.
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "That canned response no longer exists." };
  }

  const deleted = await db.cannedResponse.deleteMany({
    where: { id, shopId: session.shopId },
  });
  if (deleted.count === 0) {
    return { ok: false, error: "That canned response no longer exists." };
  }

  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tab 4 — Team
// ---------------------------------------------------------------------------

const ROLES = ["OWNER", "TECH", "FRONT_DESK"] as const;
type RoleKey = (typeof ROLES)[number];

function asRole(value: unknown): RoleKey | null {
  return ROLES.includes(value as RoleKey) ? (value as RoleKey) : null;
}

/**
 * A shop with no active owner is a shop nobody can administer — no settings, no
 * team, no voiding an invoice. Every path that could produce one is refused.
 */
async function isLastActiveOwner(shopId: string, userId: string): Promise<boolean> {
  const others = await db.user.count({
    where: { shopId, role: "OWNER", active: true, id: { not: userId } },
  });
  return others === 0;
}

/**
 * Sends an invite. The owner never types, sees or stores a password.
 *
 * The account is created with a random hash nobody knows — literally unusable —
 * plus `mustChangePassword`, and a 72-hour set-your-password link goes out by
 * email. That is the whole point: a "temporary password" passed across a
 * counter is a password two people know, and it usually stays in place.
 *
 * When the email driver is "log" (development, or a deploy with no provider
 * configured) nothing is really delivered, so the link comes back to the owner
 * to hand over. With a real provider it stays in the email.
 */
export async function inviteUserAction(input: {
  name: string;
  email: string;
  role: string;
}): Promise<InviteResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "Enter the person's name." };

  const parsedEmail = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .safeParse(input.email);
  if (!parsedEmail.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const role = asRole(input.role);
  if (!role) return { ok: false, error: "Pick a role." };

  // Email is globally unique — a person belongs to exactly one shop. Check
  // first for a friendly message, and still catch P2002 for the race.
  const existing = await db.user.findUnique({
    where: { email: parsedEmail.data },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "An account with that email already exists." };
  }

  let user: { id: string; name: string; email: string };
  try {
    user = await db.user.create({
      data: {
        shopId: session.shopId,
        email: parsedEmail.data,
        // 32 random bytes, hashed and immediately forgotten. Nothing can match
        // it, so the only way in is the emailed link.
        passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")),
        name,
        role,
        mustChangePassword: true,
      },
      select: { id: true, name: true, email: true },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, error: "An account with that email already exists." };
    }
    throw error;
  }

  const delivered = await deliverInvite(session.shopId, user);

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "user.invited",
    entity: "user",
    entityId: user.id,
    summary: `Invited ${user.name} (${user.email}) as ${role}`,
    meta: { role, delivery: delivered.delivery },
  });

  revalidatePath("/settings");
  return { ok: true, inviteUrl: delivered.inviteUrl, delivery: delivered.delivery };
}

/**
 * Re-sends the set-your-password link, for someone who has never signed in.
 *
 * Refused once `lastLoginAt` is set: after that the person has a password of
 * their own, and an owner minting a fresh link for a working account is a
 * takeover, not an invite. They use "Forgot password?" like everyone else.
 */
export async function resendInviteAction(userId: string): Promise<InviteResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const user = await db.user.findFirst({
    where: { id: userId, shopId: session.shopId },
    select: { id: true, name: true, email: true, active: true, lastLoginAt: true },
  });
  if (!user) return { ok: false, error: "That user no longer exists." };
  if (!user.active) {
    return { ok: false, error: "Reactivate the account before resending an invite." };
  }
  if (user.lastLoginAt) {
    return {
      ok: false,
      error: "They've already signed in — ask them to use \u201cForgot password?\u201d.",
    };
  }

  // Back to square one: the old link stops working the moment a new one exists.
  await db.user.update({
    where: { id: user.id },
    data: { mustChangePassword: true },
  });

  const delivered = await deliverInvite(session.shopId, user);

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "user.invited",
    entity: "user",
    entityId: user.id,
    summary: `Re-sent the invite for ${user.name} (${user.email})`,
    meta: { resend: true, delivery: delivered.delivery },
  });

  revalidatePath("/settings");
  return { ok: true, inviteUrl: delivered.inviteUrl, delivery: delivered.delivery };
}

/** Mints the 72-hour link and mails it. Shared by invite and resend. */
async function deliverInvite(
  shopId: string,
  user: { id: string; name: string; email: string },
): Promise<{ inviteUrl: string | null; delivery: string }> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true },
  });

  const issued = await issueResetToken(user.id, INVITE_TTL_MS);
  const delivery = await sendInviteEmail({
    to: user.email,
    name: user.name,
    shopName: shop?.name ?? "RepairFlow",
    url: issued.url,
  });

  return {
    inviteUrl: emailDriverName() === "log" ? issued.url : null,
    delivery,
  };
}

/**
 * Clears a member's two-step verification — the "I lost my phone and my
 * recovery codes" button. OWNER only, and it is recorded, because it is the
 * one way to take a second factor off an account you do not control.
 */
export async function resetUserTotpAction(
  userId: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const user = await db.user.findFirst({
    where: { id: userId, shopId: session.shopId },
    select: { id: true, name: true, totpEnabledAt: true },
  });
  if (!user) return { ok: false, error: "That user no longer exists." };
  if (!user.totpEnabledAt) {
    return { ok: false, error: "They don't have two-step verification on." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: [] },
  });

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "user.2fa_reset",
    entity: "user",
    entityId: user.id,
    summary: `Reset two-step verification for ${user.name}`,
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUserRoleAction(
  userId: string,
  role: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const nextRole = asRole(role);
  if (!nextRole) return { ok: false, error: "Pick a role." };

  const user = await db.user.findFirst({
    where: { id: userId, shopId: session.shopId },
    select: { id: true, role: true, active: true },
  });
  if (!user) return { ok: false, error: "That user no longer exists." };

  if (
    user.role === "OWNER" &&
    nextRole !== "OWNER" &&
    user.active &&
    (await isLastActiveOwner(session.shopId, user.id))
  ) {
    return {
      ok: false,
      error: "This is the shop's last active owner — promote someone else first.",
    };
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { role: nextRole },
    select: { name: true },
  });

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "user.role_changed",
    entity: "user",
    entityId: user.id,
    summary: `${updated.name} is now ${nextRole}`,
    meta: { from: user.role, to: nextRole },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Users are deactivated, never deleted: their name is on tickets, payments and
 * time entries, and a shop's history should not develop holes because someone
 * left. `login()` already refuses an inactive account.
 */
export async function setUserActiveAction(
  userId: string,
  active: boolean,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  if (userId === session.userId && !active) {
    return { ok: false, error: "You can't deactivate your own account." };
  }

  const user = await db.user.findFirst({
    where: { id: userId, shopId: session.shopId },
    select: { id: true, role: true },
  });
  if (!user) return { ok: false, error: "That user no longer exists." };

  if (
    !active &&
    user.role === "OWNER" &&
    (await isLastActiveOwner(session.shopId, user.id))
  ) {
    return {
      ok: false,
      error: "This is the shop's last active owner — promote someone else first.",
    };
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { active },
    select: { name: true },
  });

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: active ? "user.reactivated" : "user.deactivated",
    entity: "user",
    entityId: user.id,
    summary: `${updated.name} was ${active ? "reactivated" : "deactivated"}`,
  });

  revalidatePath("/settings");
  return { ok: true };
}
