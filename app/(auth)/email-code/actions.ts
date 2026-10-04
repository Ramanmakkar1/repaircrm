"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { completeSignIn } from "@/lib/auth";
import { setPending2faCookie } from "@/lib/pending-2fa";
import { issueResetToken } from "@/lib/password-reset";
import { requestEmailCode, verifyEmailCode, type EmailCodePurpose } from "@/lib/email-code";
import { rateLimit } from "@/lib/rate-limit";
import { homePath } from "@/lib/prefs";

export type CodeState = { challenge?: string; email?: string; requestedAt?: number; error?: string };
export async function emailCodeAction(purpose: EmailCodePurpose, previous: CodeState, form: FormData): Promise<CodeState> {
  if (purpose !== "login" && purpose !== "reset") return { error: "Invalid request." };
  const ip = (await headers()).get("x-real-ip") || "local";
  if (!rateLimit(`email-auth-ip:${ip}`, 30, 15 * 60_000).allowed) return { ...previous, error: "Too many requests. Please try again in 15 minutes." };
  if (previous.challenge && form.get("action") !== "resend") {
    const user = await verifyEmailCode(previous.challenge, String(form.get("code") || "").trim(), purpose);
    if (!user) return { ...previous, error: "That code is invalid or expired. Request a new code if needed." };
    if (purpose === "reset") {
      const token = await issueResetToken(user.id, 10 * 60_000);
      redirect(`/reset-password/${token.token}`);
    }
    if (user.totpEnabledAt) {
      await setPending2faCookie(user.id);
      redirect("/login/verify");
    }
    await completeSignIn(user, { via: "email_code" });
    redirect(await homePath());
  }
  if (previous.challenge && previous.requestedAt && Date.now() - previous.requestedAt < 60_000) return { ...previous, error: "Please wait one minute before requesting another code. Your current code still works." };
  const email = String(form.get("email") || previous.email || "").trim().toLowerCase();
  if (!z.email().safeParse(email).success || email.length > 254) return { error: "Enter a valid email address." };
  return { email, requestedAt: Date.now(), challenge: await requestEmailCode(email, purpose) };
}
