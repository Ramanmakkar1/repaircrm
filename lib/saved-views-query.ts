import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  SAVED_VIEW_LIMIT,
  type SavedViewItem,
  type SavedViewPath,
} from "@/lib/saved-views";

/**
 * The one saved-views query that needs a session.
 *
 * Separate from `lib/saved-views.ts` because that module is imported by a
 * `"use client"` component, and anything reachable from it must be safe in a
 * browser bundle. `requireUser` reaches `next/headers`; keeping it here is
 * what stops the save dialog from dragging the session machinery into the
 * client and breaking the route's compile.
 *
 * Scoped by BOTH userId and shopId. The userId alone would be enough today,
 * because a user belongs to one shop — but "today" is doing a lot of work in
 * that sentence, and a query that stays correct if that ever changes costs
 * nothing to write now.
 */
export async function listSavedViews(
  path: SavedViewPath,
): Promise<SavedViewItem[]> {
  const session = await requireUser();

  return db.savedView.findMany({
    where: { userId: session.userId, shopId: session.shopId, path },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, query: true },
    take: SAVED_VIEW_LIMIT,
  });
}
