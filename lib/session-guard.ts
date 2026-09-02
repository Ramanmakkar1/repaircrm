import { redirect } from "next/navigation";

import { passwordVersion, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

/**
 * The once-per-request check the (app) layout runs on top of `requireUser()`.
 *
 * The session cookie is a stateless JWT, which is what keeps every other page
 * free of a database round-trip — but three things can go stale inside its
 * seven-day life, and all three matter:
 *
 *   1. The password changed. The session carries `pv` (passwordChangedAt as
 *      epoch seconds); anything older than the stored value is a session issued
 *      to a browser that no longer knows the password, so it is cut off. This
 *      is what makes "change my password" log the other devices out.
 *   2. The account was deactivated. `login()` refuses an inactive account, but
 *      a session issued before the switch was flipped would otherwise run to
 *      its natural expiry.
 *   3. The account is on a forced password change (a fresh invite). Nothing
 *      else in the app is reachable until it is done.
 *
 * One indexed read on the primary key, shared by the whole request through the
 * layout — pages keep calling `requireUser()` and pay nothing.
 */
export async function requireLiveUser(): Promise<SessionUser> {
  const session = await requireUser();

  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { active: true, passwordChangedAt: true, mustChangePassword: true },
  });

  // The row is gone (shop deleted, user purged) — treat it as signed out.
  if (!user) redirect("/session-expired?reason=gone");
  if (!user.active) redirect("/session-expired?reason=inactive");
  if ((session.pv ?? 0) < passwordVersion(user.passwordChangedAt)) {
    redirect("/session-expired?reason=password");
  }
  if (user.mustChangePassword) redirect("/change-password");

  return session;
}
