"use server";

import { revalidatePath } from "next/cache";

import { recountStorage } from "@/lib/platform-shops";

/** Measures every shop's space again now. Read-only: nothing about any shop changes. */
export async function recountStorageAction(): Promise<void> {
  // recountStorage() checks the operator session before it reads anything.
  await recountStorage();
  revalidatePath("/platform", "layout");
}
