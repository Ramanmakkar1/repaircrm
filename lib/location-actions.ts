"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ALL_LOCATIONS,
  LOCATION_COOKIE,
  LOCATION_COOKIE_MAX_AGE,
} from "@/lib/location";

/**
 * The one write behind the topbar branch switcher.
 *
 * Split out of lib/location.ts for the same reason lib/auth-actions.ts is
 * split out of lib/auth.ts: a `"use server"` module may only export async
 * functions, and everything in lib/location.ts is a read a page performs
 * during render.
 *
 * The posted value is validated against the session's own shop before it is
 * stored, so the cookie can never name another tenant's branch.
 */
export async function setLocationCookie(value: string): Promise<void> {
  const { shopId } = await requireUser();

  let next = ALL_LOCATIONS;
  if (value && value !== ALL_LOCATIONS) {
    const location = await db.location.findFirst({
      where: { id: value, shopId, active: true },
      select: { id: true },
    });
    if (location) next = location.id;
  }

  const jar = await cookies();
  jar.set(LOCATION_COOKIE, next, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCATION_COOKIE_MAX_AGE,
  });

  // Every list, tile and board reads this cookie, so the whole shell is stale.
  revalidatePath("/", "layout");
}
