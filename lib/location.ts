import { cookies } from "next/headers";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Which branch the app is currently looking at.
 *
 * A shop with one location never sees any of this: the switcher is hidden, the
 * pickers are hidden, and every filter resolves to "all". Only a shop that has
 * actually opened a second store pays any attention cost.
 *
 * THE COOKIE, `rf_location`, holds either the sentinel "all" or a location id.
 * It is a *preference*, never an authority: the id is re-validated against the
 * session's shop on every read, so a hand-edited cookie can only ever select
 * one of this tenant's own active locations, or fall back to "all".
 */

export const LOCATION_COOKIE = "rf_location";

/** The "don't filter" sentinel. Radix Select cannot hold an empty string. */
export const ALL_LOCATIONS = "all";

/** One year — a branch preference is not something to re-pick every week. */
export const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type LocationOption = { id: string; name: string };

/** The branches a switcher may offer, in the order they are shown. */
export async function activeLocations(shopId: string): Promise<LocationOption[]> {
  return db.location.findMany({
    where: { shopId, active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

/**
 * The location the current request should be scoped to: the cookie when it
 * names an active location of this shop, otherwise the user's own home branch,
 * otherwise "all".
 */
export async function currentLocationId(): Promise<string> {
  const session = await getSession();
  if (!session) return ALL_LOCATIONS;

  const jar = await cookies();
  const raw = jar.get(LOCATION_COOKIE)?.value?.trim();

  if (raw && raw !== ALL_LOCATIONS) {
    const picked = await db.location.findFirst({
      where: { id: raw, shopId: session.shopId, active: true },
      select: { id: true },
    });
    if (picked) return picked.id;
    // A stale or forged id simply falls through to the user's own default.
  }
  if (raw === ALL_LOCATIONS) return ALL_LOCATIONS;

  const home = await userDefaultLocationId(session.shopId, session.userId);
  return home ?? ALL_LOCATIONS;
}

/**
 * `{ locationId }` when one branch is selected, `{}` when it is "all" — spread
 * straight into a Prisma `where` so a list filters without an if/else.
 */
export async function locationWhere(): Promise<{ locationId?: string }> {
  const id = await currentLocationId();
  return id === ALL_LOCATIONS ? {} : { locationId: id };
}

/** The user's home branch, if it is still an active location of this shop. */
export async function userDefaultLocationId(
  shopId: string,
  userId: string,
): Promise<string | null> {
  const user = await db.user.findFirst({
    where: { id: userId, shopId },
    select: { defaultLocation: { select: { id: true, active: true } } },
  });
  const home = user?.defaultLocation;
  return home && home.active ? home.id : null;
}

/** The shop's own default branch — the last fallback, and the only one a job has. */
export async function shopDefaultLocationId(shopId: string): Promise<string | null> {
  const preferred = await db.location.findFirst({
    where: { shopId, isDefault: true, active: true },
    select: { id: true },
  });
  if (preferred) return preferred.id;

  // A shop whose default was deactivated behind our back still gets stamped
  // with *a* branch rather than none.
  const fallback = await db.location.findFirst({
    where: { shopId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

/**
 * Which branch a new document belongs to: the branch on screen, else the
 * user's home branch, else the shop's default. Used by every invoice-creating
 * path and by ticket intake.
 */
export async function newRecordLocationId(
  shopId: string,
  userId: string,
): Promise<string | null> {
  const current = await currentLocationId();
  if (current !== ALL_LOCATIONS) return current;
  return (
    (await userDefaultLocationId(shopId, userId)) ??
    (await shopDefaultLocationId(shopId))
  );
}

/** Verifies an id posted from a form is one of this shop's active branches. */
export async function validLocationId(
  shopId: string,
  locationId: string | null,
): Promise<string | null> {
  if (!locationId || locationId === ALL_LOCATIONS) return null;
  const location = await db.location.findFirst({
    where: { id: locationId, shopId, active: true },
    select: { id: true },
  });
  return location?.id ?? null;
}
