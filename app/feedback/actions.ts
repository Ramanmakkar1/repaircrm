"use server";

import { headers } from "next/headers";
import { getSession, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { feedbackSchema, type FeedbackState, type FeedbackValues } from "@/lib/product-feedback";

export async function submitFeedbackAction(_previous: FeedbackState, form: FormData): Promise<FeedbackState> {
  const text = (name: string) => typeof form.get(name) === "string" ? String(form.get(name)) : "";
  const values = { kind: text("kind"), title: text("title"), detail: text("detail"), email: text("email").trim(), page: text("page") };
  // Bot honeypot: do not store it or disclose which check caught the submission.
  if (text("website")) return { success: true };
  const head = await headers();
  const ip = (head.get("x-forwarded-for")?.split(",")[0]?.trim() || head.get("x-real-ip") || "unknown").slice(0, 45);
  const limit = rateLimit(`product-feedback:${ip}`, 5, 10 * 60_000);
  if (!limit.allowed) return { error: `You’ve sent several reports. Please try again ${retryAfterLabel(limit.retryAfterMs)}.`, values: values as FeedbackValues };
  const parsed = feedbackSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: values as FeedbackValues };
  const input = parsed.data;
  const session = await getSession();
  // Signed-in attribution must pass the live account guard, not trust stale JWTs.
  const reporter = session ? await requireUser() : null;
  try {
    await db.productFeedback.create({ data: {
      kind: input.kind, title: input.title, detail: input.detail,
      email: input.email || null, page: input.page || null,
      reporterUserId: reporter?.userId ?? null,
      reporterShopId: reporter?.shopId ?? null,
    } });
    return { success: true };
  } catch {
    return { error: "Your report could not be saved. Please try again shortly.", values: input };
  }
}
