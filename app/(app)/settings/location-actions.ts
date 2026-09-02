"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SettingsResult } from "@/components/settings/types";

/**
 * Branch (Location) management — OWNER only.
 *
 * Every action re-derives `shopId` from the session and reaches its target
 * with a shop-scoped filter, so a forged id from another tenant matches
 * nothing rather than renaming somebody else's store.
 *
 * TWO INVARIANTS, enforced here and mirrored as disabled buttons in the tab:
 *   1. exactly one default location, always;
 *   2. at least one ACTIVE location, always — tickets and invoices are stamped
 *      with one, and a shop with none would have nowhere to put new work.
 */

const locationSchema = z.object({
  name: z.string().trim().min(1, "Give the location a name.").max(80),
  address1: z.string().trim().max(200).nullable(),
  address2: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(80).nullable(),
  state: z.string().trim().max(80).nullable(),
  postalCode: z.string().trim().max(20).nullable(),
  phone: z.string().trim().max(40).nullable(),
});

export type LocationInput = {
  id?: string | null;
  name: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
};

async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { session, denied: "Only an owner can manage locations." };
  }
  return { session, denied: null as string | null };
}

/** Blank strings become null so an emptied field clears rather than stores "". */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Everything the settings screen (and the switcher) reads is behind these. */
function revalidateLocations(): void {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function saveLocationAction(
  input: LocationInput,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const parsed = locationSchema.safeParse({
    name: input.name,
    address1: blankToNull(input.address1),
    address2: blankToNull(input.address2),
    city: blankToNull(input.city),
    state: blankToNull(input.state),
    postalCode: blankToNull(input.postalCode),
    phone: blankToNull(input.phone),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (input.id) {
    const updated = await db.location.updateMany({
      where: { id: input.id, shopId: session.shopId },
      data: parsed.data,
    });
    if (updated.count === 0) return { ok: false, error: "That location no longer exists." };
  } else {
    // The very first location a shop creates is its default; after that a new
    // one is just another branch until someone promotes it.
    const existing = await db.location.count({ where: { shopId: session.shopId } });
    await db.location.create({
      data: { shopId: session.shopId, ...parsed.data, isDefault: existing === 0 },
    });
  }

  revalidateLocations();
  return { ok: true };
}

/**
 * Promotes one location to default and demotes the rest, in one transaction so
 * the shop is never briefly left with two defaults or none.
 */
export async function setDefaultLocationAction(
  locationId: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const location = await db.location.findFirst({
    where: { id: locationId, shopId: session.shopId },
    select: { id: true, active: true },
  });
  if (!location) return { ok: false, error: "That location no longer exists." };
  if (!location.active) {
    return { ok: false, error: "Reactivate this location before making it the default." };
  }

  await db.$transaction([
    db.location.updateMany({
      where: { shopId: session.shopId, isDefault: true },
      data: { isDefault: false },
    }),
    db.location.update({ where: { id: location.id }, data: { isDefault: true } }),
  ]);

  revalidateLocations();
  return { ok: true };
}

/**
 * Locations are deactivated, never deleted: their name is on tickets and
 * invoices, and a shop's history should not develop holes because a branch
 * closed. An inactive location stops being offered anywhere new work is filed.
 */
export async function setLocationActiveAction(
  locationId: string,
  active: boolean,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const location = await db.location.findFirst({
    where: { id: locationId, shopId: session.shopId },
    select: { id: true, isDefault: true },
  });
  if (!location) return { ok: false, error: "That location no longer exists." };

  if (!active) {
    if (location.isDefault) {
      return {
        ok: false,
        error: "This is the shop's default location — make another one the default first.",
      };
    }
    const others = await db.location.count({
      where: { shopId: session.shopId, active: true, id: { not: location.id } },
    });
    if (others === 0) {
      return { ok: false, error: "A shop needs at least one active location." };
    }
  }

  await db.location.update({ where: { id: location.id }, data: { active } });

  // Anyone based here loses their home branch; the switcher falls back to
  // "All locations" for them rather than pointing at a closed store.
  if (!active) {
    await db.user.updateMany({
      where: { shopId: session.shopId, defaultLocationId: location.id },
      data: { defaultLocationId: null },
    });
  }

  revalidateLocations();
  return { ok: true };
}

/**
 * Sets `User.defaultLocationId` for everyone in the shop in one pass: the ids
 * listed are based here, and anyone previously based here who is not on the
 * list is unassigned. Ids from another tenant are dropped, not trusted.
 */
export async function setLocationStaffAction(
  locationId: string,
  userIds: string[],
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const location = await db.location.findFirst({
    where: { id: locationId, shopId: session.shopId, active: true },
    select: { id: true },
  });
  if (!location) return { ok: false, error: "That location no longer exists." };

  const wanted = await db.user.findMany({
    where: { id: { in: userIds.filter(Boolean) }, shopId: session.shopId },
    select: { id: true },
  });
  const ids = wanted.map((user) => user.id);

  await db.$transaction([
    db.user.updateMany({
      where: {
        shopId: session.shopId,
        defaultLocationId: location.id,
        id: { notIn: ids.length > 0 ? ids : ["_none_"] },
      },
      data: { defaultLocationId: null },
    }),
    db.user.updateMany({
      where: { shopId: session.shopId, id: { in: ids } },
      data: { defaultLocationId: location.id },
    }),
  ]);

  revalidateLocations();
  return { ok: true };
}
