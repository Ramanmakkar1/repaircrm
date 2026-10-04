"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { writeUiPrefs } from "@/lib/prefs";

/**
 * Easy or Full screen style, for THIS device, without leaving the screen.
 *
 * The older setSimpleModeAction (app/(app)/prefs-actions.ts) always jumped to
 * Home or the dashboard, so a person who switched to look at a table lost the
 * page they were on. This one only writes the preference and re-renders the
 * layout: the current screen redraws in the chosen style where it is.
 */
export async function setScreenStyleAction(simple: boolean): Promise<void> {
  await requireUser();
  await writeUiPrefs({ simple: simple === true });
  revalidatePath("/", "layout");
}
