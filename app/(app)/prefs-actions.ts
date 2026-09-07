"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { writeUiPrefs, type Density } from "@/lib/prefs";

/**
 * Display preferences: how dense the app is, and whether the rail is collapsed.
 *
 * These are server actions rather than a client-side cookie write because the
 * SERVER renders the result — the density attribute on the shell and the rail's
 * width are both decided before the first byte. Writing the cookie in the
 * browser would mean a correct render only on the *next* navigation, and a
 * visible snap on this one.
 *
 * `requireUser` guards them not because a display preference is sensitive, but
 * because an unauthenticated caller has no shell to apply it to — and an
 * endpoint that writes a cookie for anyone who asks is a small free gift to
 * anybody probing the app.
 */

export async function setDensityAction(density: Density): Promise<void> {
  await requireUser();
  await writeUiPrefs({
    density: density === "compact" ? "compact" : "comfortable",
  });
  // The layout reads the cookie, so the whole shell has to re-render — not
  // just the page that happened to host the control.
  revalidatePath("/", "layout");
}

export async function setRailCollapsedAction(collapsed: boolean): Promise<void> {
  await requireUser();
  await writeUiPrefs({ railCollapsed: collapsed === true });
  revalidatePath("/", "layout");
}
