"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { hashPassword, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBps } from "@/lib/money";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import {
  settingsError,
  settingsSuccess,
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

export async function inviteUserAction(input: {
  name: string;
  email: string;
  password: string;
  role: string;
}): Promise<SettingsResult> {
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

  if (input.password.length < 8) {
    return { ok: false, error: "The temporary password must be at least 8 characters." };
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

  try {
    await db.user.create({
      data: {
        shopId: session.shopId,
        email: parsedEmail.data,
        passwordHash: await hashPassword(input.password),
        name,
        role,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, error: "An account with that email already exists." };
    }
    throw error;
  }

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

  await db.user.update({ where: { id: user.id }, data: { role: nextRole } });

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

  await db.user.update({ where: { id: user.id }, data: { active } });

  revalidatePath("/settings");
  return { ok: true };
}
