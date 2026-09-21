import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { db } from "@/lib/db";
import { platformPasswordVersion, readPlatformCookie } from "@/lib/platform-session";

type PlatformSetting =
  | "PLATFORM_HOST"
  | "CF_ANALYTICS_API_TOKEN"
  | "CLOUDFLARE_ACCOUNT_ID"
  | "CF_WORKER_NAME"
  | "PLATFORM_MONTHLY_BUDGET_USD"
  | "PLANETSCALE_SERVICE_TOKEN_ID"
  | "PLANETSCALE_SERVICE_TOKEN"
  | "PLANETSCALE_ORGANIZATION"
  | "PLANETSCALE_DATABASE"
  | "PLANETSCALE_BRANCH";

/** Read bindings in Workers and process env during local Next.js development. */
export function platformSetting(name: PlatformSetting): string | undefined {
  let binding: string | undefined;

  try {
    const env = getCloudflareContext({ async: false }).env as unknown as Record<
      string,
      unknown
    >;
    const value = env[name];
    if (typeof value === "string") binding = value;
  } catch {
    // Next.js development runs outside the Workers request context.
  }

  const value = binding || process.env[name];
  return value?.trim() || undefined;
}

/**
 * When set (e.g. "admin.repairpilot.com"), the console only answers on that
 * host and is a plain 404 everywhere else — the shop app's address does not
 * even reveal that it exists.
 */
export async function assertPlatformHost(): Promise<void> {
  const wanted = platformSetting("PLATFORM_HOST")?.toLowerCase();
  if (!wanted) return;
  const host = ((await headers()).get("host") ?? "").toLowerCase().split(":")[0];
  if (host !== wanted) notFound();
}

/**
 * The console's guard. Identity is a PlatformAdmin row reached through the
 * platform's own cookie (lib/platform-session.ts) — NOT a shop user. No shop
 * login, whatever its role or email, is ever a platform admin, so a shop owner
 * who registers an operator's email address gains nothing.
 */
export async function requirePlatformAdmin(): Promise<{ id: string; name: string; email: string }> {
  await assertPlatformHost();
  const session = await readPlatformCookie();
  if (!session) redirect("/platform/login");

  const admin = await db.platformAdmin.findFirst({
    where: { id: session.adminId },
    select: { id: true, name: true, email: true, active: true, passwordChangedAt: true },
  });
  if (!admin || !admin.active || session.pv < platformPasswordVersion(admin.passwordChangedAt)) {
    redirect("/platform/login?reason=expired");
  }
  return { id: admin.id, name: admin.name, email: admin.email };
}
