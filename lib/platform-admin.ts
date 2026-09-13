import "server-only";

import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { db } from "@/lib/db";
import { requireLiveUser } from "@/lib/session-guard";
import { isPlatformAdminEmail } from "@/lib/platform-admin-access";

type PlatformSetting =
  | "PLATFORM_ADMIN_EMAILS"
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
 * A platform admin must be both a current, active RepairPilot user and named
 * in explicit deployment configuration. Shop OWNER status grants no platform
 * privileges. Global reads are allowed only after this guard succeeds.
 */
export async function requirePlatformAdmin(): Promise<{
  name: string;
  email: string;
}> {
  const session = await requireLiveUser();
  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { name: true, email: true, active: true },
  });

  if (
    !user?.active ||
    !isPlatformAdminEmail(user.email, platformSetting("PLATFORM_ADMIN_EMAILS"))
  ) {
    notFound();
  }

  return { name: user.name, email: user.email };
}
