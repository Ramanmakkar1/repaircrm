"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { assertPlatformHost } from "@/lib/platform-admin";
import { clearPlatformCookie, platformPasswordVersion, setPlatformCookie } from "@/lib/platform-session";

export type PlatformLoginState = { error?: string };

/** Failed sign-ins per email per hour, counted in Postgres (memory is per-isolate on Workers). */
const MAX_FAILURES_PER_HOUR = 8;

function hourBucket(): string {
  return new Date().toISOString().slice(0, 13);
}

async function failures(email: string): Promise<number> {
  const row = await db.usageCounter.findUnique({
    where: { shopId_key_day: { shopId: "*platform", key: `login:${email}`, day: hourBucket() } },
    select: { count: true },
  });
  return row?.count ?? 0;
}

async function recordFailure(email: string): Promise<void> {
  await db.usageCounter.upsert({
    where: { shopId_key_day: { shopId: "*platform", key: `login:${email}`, day: hourBucket() } },
    create: { shopId: "*platform", key: `login:${email}`, day: hourBucket(), count: 1 },
    update: { count: { increment: 1 } },
  });
}

/**
 * Platform sign-in. Deliberately shares NOTHING with the shop login: another
 * table, another cookie, another page. One vague error for every failure, so
 * the form never confirms which operator emails exist.
 */
export async function platformLoginAction(
  _previous: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  await assertPlatformHost();
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(formData.get("password") ?? "");
  const vague = { error: "That email and password don't match an operator account." };
  if (!email || !password) return vague;

  if ((await failures(email)) >= MAX_FAILURES_PER_HOUR) {
    return { error: "Too many attempts. Try again in an hour." };
  }

  const admin = await db.platformAdmin.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, active: true, passwordChangedAt: true },
  });
  // Compare even when there is no such admin, so response time does not say which emails exist.
  const ok = await bcrypt.compare(
    password,
    admin?.passwordHash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5e3JxVJ9N1Ghc1Gk/Hn6aZk0Qm0Qm0K",
  );
  if (!admin || !admin.active || !ok) {
    await recordFailure(email);
    return vague;
  }

  await db.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await setPlatformCookie({
    adminId: admin.id,
    email: admin.email,
    pv: platformPasswordVersion(admin.passwordChangedAt),
  });
  redirect("/platform");
}

export async function platformLogoutAction(): Promise<void> {
  await clearPlatformCookie();
  redirect("/platform/login");
}
