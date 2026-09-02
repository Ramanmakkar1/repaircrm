"use server";

import { readAuditPage } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import type { AuditPage } from "@/components/settings/audit-types";

/**
 * "Load more" on Settings → Audit log.
 *
 * OWNER only, and the shop always comes from the session — there is no shopId
 * parameter here by design. The cursor is an opaque row id filtered by that
 * same shopId, so a borrowed cursor from another tenant returns nothing.
 */
export async function loadAuditPageAction(input: {
  entity?: string;
  userId?: string;
  cursor?: string | null;
}): Promise<AuditPage | { error: string }> {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { error: "Only an owner can read the audit log." };
  }

  return readAuditPage(session.shopId, {
    entity: input.entity,
    userId: input.userId,
    cursor: input.cursor,
  });
}
