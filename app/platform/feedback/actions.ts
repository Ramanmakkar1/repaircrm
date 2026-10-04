"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { FEEDBACK_STATUSES } from "@/lib/product-feedback";

export async function updateFeedbackStatusAction(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const input = z.object({ id: z.string().min(1).max(100), status: z.enum(FEEDBACK_STATUSES) }).safeParse({ id: form.get("id"), status: form.get("status") });
  if (!input.success) throw new Error("Choose a valid report and status.");
  // Platform-owned records; no shop account can reach this mutation.
  await db.productFeedback.updateMany({ where: { id: input.data.id }, data: { status: input.data.status } });
  revalidatePath("/platform/feedback");
}
