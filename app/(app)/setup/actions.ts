"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBps, parseCents } from "@/lib/money";
import { inviteUserAction } from "@/app/(app)/settings/actions";
import {
  isStepKey,
  readOnboarding,
  type OnboardingState,
  type StepKey,
} from "@/components/onboarding/steps";
import type { SettingsResult } from "@/components/settings/types";

/**
 * The onboarding wizard's mutations.
 *
 * Every one derives `shopId` from the session and refuses anyone but an owner:
 * this screen sets a shop's tax rate and creates staff accounts, which is not
 * a technician's business even on their first day.
 *
 * ---------------------------------------------------------------------------
 * WHY PROGRESS IS MERGED, NEVER REPLACED
 * ---------------------------------------------------------------------------
 * `Shop.settings` is one Json blob shared with the Workflow tab
 * (problemTypes, ticketStatuses) and the automation runner's last-run stamp.
 * Writing `{ onboarding: … }` over it would erase both. So every write here
 * preserves two levels: the top-level keys this file knows nothing about, and
 * the onboarding keys this particular write is not setting.
 *
 * A read-modify-write on a Json column is not atomic. Nothing anyone relies on
 * is stored here — it is a wizard's page number — and the alternative, a table
 * for five booleans, is not worth its migration.
 * ---------------------------------------------------------------------------
 */

async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { session, denied: "Only an owner can run shop setup." };
  }
  return { session, denied: null as string | null };
}

function mergeOnboarding(
  current: Prisma.JsonValue | null | undefined,
  patch: OnboardingState,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};

  return {
    ...base,
    onboarding: { ...readOnboarding(current), ...patch },
  } as Prisma.InputJsonValue;
}

/** Re-reads immediately before writing, to keep the merge window one statement wide. */
async function patchOnboarding(
  shopId: string,
  patch: OnboardingState,
): Promise<OnboardingState> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });
  if (!shop) return {};

  const merged = { ...readOnboarding(shop.settings), ...patch };
  await db.shop.update({
    where: { id: shopId },
    data: { settings: mergeOnboarding(shop.settings, patch) },
  });
  return merged;
}

function withStep(
  list: StepKey[] | undefined,
  step: StepKey,
  present: boolean,
): StepKey[] {
  const set = new Set(list ?? []);
  if (present) set.add(step);
  else set.delete(step);
  return [...set];
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Records the outcome of a step and where the operator went next.
 *
 * "Completed" and "skipped" are kept apart rather than collapsed into one
 * "seen" flag, because the dashboard checklist reads the same shop and a step
 * that was skipped is exactly the thing the checklist should still be nagging
 * about.
 */
export async function advanceOnboardingAction(input: {
  step: string;
  outcome: "completed" | "skipped";
  next: string | null;
}): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };
  if (!isStepKey(input.step)) return { ok: false, error: "Unknown step." };

  const current = await db.shop.findUnique({
    where: { id: session.shopId },
    select: { settings: true },
  });
  const state = readOnboarding(current?.settings);

  await patchOnboarding(session.shopId, {
    completed: withStep(
      state.completed,
      input.step,
      input.outcome === "completed",
    ),
    skipped: withStep(state.skipped, input.step, input.outcome === "skipped"),
    current: isStepKey(input.next) ? input.next : state.current,
  });

  revalidatePath("/setup");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Plain navigation — clicking a progress dot or Back. */
export async function setOnboardingStepAction(
  step: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };
  if (!isStepKey(step)) return { ok: false, error: "Unknown step." };

  await patchOnboarding(session.shopId, { current: step });
  return { ok: true };
}

/** "Finish" — stamps the wizard done. The dashboard card takes over from here. */
export async function finishOnboardingAction(): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  await patchOnboarding(session.shopId, {
    completed: withStep(
      readOnboarding(
        (
          await db.shop.findUnique({
            where: { id: session.shopId },
            select: { settings: true },
          })
        )?.settings,
      ).completed,
      "ready",
      true,
    ),
    finishedAt: new Date().toISOString(),
    current: "ready",
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Hides the dashboard's setup card for this shop.
 *
 * Per shop, not per user: the checklist is about the shop's configuration, and
 * an owner who has decided they do not want a card about it should not have
 * that decision undone by their colleague's browser.
 */
export async function dismissSetupChecklistAction(): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  await patchOnboarding(session.shopId, { dismissed: true });
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Step 1 — shop details + sales tax
// ---------------------------------------------------------------------------

/**
 * A narrower `updateShopAction`: only the fields this card shows are written,
 * so the wizard cannot blank an address line it never asked about.
 */
export async function saveShopBasicsAction(input: {
  name: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  taxRate: string;
}): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "The shop needs a name." };

  const taxRateBps = parseBps(input.taxRate);
  if (taxRateBps < 0 || taxRateBps > 10_000) {
    return { ok: false, error: "Enter a tax rate between 0 and 100%." };
  }

  await db.shop.update({
    where: { id: session.shopId },
    data: {
      name,
      phone: input.phone.trim().slice(0, 40) || null,
      address1: input.address1.trim().slice(0, 200) || null,
      city: input.city.trim().slice(0, 80) || null,
      state: input.state.trim().slice(0, 80) || null,
      postalCode: input.postalCode.trim().slice(0, 20) || null,
      taxRateBps,
    },
  });

  // The shop block is on every printed document and in the app shell.
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Step 2 — invite the team
// ---------------------------------------------------------------------------

export type InviteOutcome = {
  name: string;
  email: string;
  /**
   * The set-your-password link, when the email driver could not really deliver
   * it (development, or a deploy with no provider configured). Null once a real
   * provider has the email — the link stays in the person's inbox, where it
   * belongs.
   */
  inviteUrl: string | null;
  /** How it went out: the driver name, or "log". */
  delivery: string;
};

/**
 * Creates staff accounts through the SAME `inviteUserAction` the Team tab uses
 * — one code path for "make a user", one place the owner-only check and the
 * duplicate-email race live.
 *
 * Nobody types a password. Each account is created with an unusable random hash
 * and a 72-hour set-your-password link goes out by email — the same flow the
 * Team tab uses. When the email driver is "log" the link comes back here so the
 * owner can hand it over in the room; with a real provider it stays in the
 * inbox and this returns null.
 */
export async function inviteTeamAction(
  rows: { name: string; email: string; role: string }[],
): Promise<
  | { ok: true; invited: InviteOutcome[] }
  | { ok: false; error: string; invited: InviteOutcome[] }
> {
  const { denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied, invited: [] };

  const wanted = rows
    .map((row) => ({
      name: row.name.trim(),
      email: row.email.trim().toLowerCase(),
      role: row.role,
    }))
    .filter((row) => row.name !== "" || row.email !== "");

  if (wanted.length === 0) {
    return { ok: false, error: "Add at least one person, or skip this step.", invited: [] };
  }
  if (wanted.length > 10) {
    return { ok: false, error: "Add up to ten people at a time.", invited: [] };
  }

  const invited: InviteOutcome[] = [];

  for (const row of wanted) {
    if (!z.string().email().safeParse(row.email).success) {
      return {
        ok: false,
        error: `"${row.email || row.name}" is not a valid email address.`,
        invited,
      };
    }

    const result = await inviteUserAction({
      name: row.name,
      email: row.email,
      role: row.role,
    });

    if (!result.ok) {
      return { ok: false, error: `${row.email}: ${result.error}`, invited };
    }
    invited.push({
      name: row.name,
      email: row.email,
      inviteUrl: result.inviteUrl,
      delivery: result.delivery,
    });
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, invited };
}


// ---------------------------------------------------------------------------
// Step 4 — the first products and services
// ---------------------------------------------------------------------------

export async function createStarterItemsAction(
  rows: { name: string; price: string; taxable: boolean }[],
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const wanted = rows
    .map((row) => ({
      name: row.name.trim().slice(0, 120),
      priceCents: parseCents(row.price),
      taxable: row.taxable,
    }))
    .filter((row) => row.name !== "");

  if (wanted.length === 0) {
    return { ok: false, error: "Add at least one item, or skip this step." };
  }
  if (wanted.some((row) => row.priceCents < 0)) {
    return { ok: false, error: "A price cannot be negative." };
  }

  // createMany, not a loop: three items are one round trip, and a partial
  // failure here would leave the operator guessing which row went in.
  const created = await db.product.createMany({
    data: wanted.map((row) => ({
      shopId: session.shopId,
      name: row.name,
      priceCents: row.priceCents,
      taxable: row.taxable,
    })),
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true, created: created.count };
}
