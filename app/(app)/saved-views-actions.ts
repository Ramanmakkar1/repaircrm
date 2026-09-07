"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  SAVED_VIEW_LIMIT,
  SAVED_VIEW_NAME_MAX,
  isSavedViewPath,
  normalizeViewQuery,
} from "@/lib/saved-views";

/**
 * Create and remove saved views.
 *
 * These return their refusals as DATA rather than throwing them. Next 16's RSC
 * error channel serializes a `digest` only — a thrown error's message is
 * discarded in a production build and the client sees "An error occurred in
 * the Server Components render", which is useless to somebody who just wants
 * to know their view name is already taken.
 */

export type SavedViewResult = { ok: true } | { ok: false; error: string };

export async function createSavedViewAction(input: {
  path: string;
  name: string;
  query: string;
}): Promise<SavedViewResult> {
  const session = await requireUser();

  // A closed list, so `path` cannot become a place to write arbitrary strings
  // against a user account.
  if (!isSavedViewPath(input.path)) {
    return { ok: false, error: "That screen does not support saved views." };
  }

  const name = input.name.trim().slice(0, SAVED_VIEW_NAME_MAX);
  if (!name) return { ok: false, error: "Give the view a name." };

  const query = normalizeViewQuery(input.query);

  const count = await db.savedView.count({
    where: { userId: session.userId, path: input.path },
  });
  if (count >= SAVED_VIEW_LIMIT) {
    return {
      ok: false,
      error: `You can keep ${SAVED_VIEW_LIMIT} views per screen. Delete one first.`,
    };
  }

  try {
    await db.savedView.create({
      data: {
        shopId: session.shopId,
        userId: session.userId,
        path: input.path,
        name,
        query,
        sortOrder: count,
      },
    });
  } catch (error) {
    // The unique index on (userId, path, name) is the authority on duplicates,
    // not a pre-check — a pre-check races with a second tab.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: `You already have a view called "${name}".` };
    }
    throw error;
  }

  revalidatePath(input.path);
  return { ok: true };
}

export async function deleteSavedViewAction(
  id: string,
): Promise<SavedViewResult> {
  const session = await requireUser();

  // Prisma reads `id: undefined` as "no filter" — without this guard a
  // malformed call would delete every saved view this user has. The same
  // pattern has already bitten this codebase once (canned responses).
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "That view no longer exists." };
  }

  // deleteMany with the ownership filter: a forged id belonging to a colleague
  // matches nothing rather than deleting their view.
  const deleted = await db.savedView.deleteMany({
    where: { id, userId: session.userId, shopId: session.shopId },
  });
  if (deleted.count === 0) {
    return { ok: false, error: "That view no longer exists." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
