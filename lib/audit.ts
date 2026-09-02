import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  AUDIT_PAGE_SIZE,
  type AuditPage,
  type AuditRow,
} from "@/components/settings/audit-types";

/**
 * The shop's security trail: who did what, and when.
 *
 * THE RULE THIS MODULE EXISTS FOR: `audit()` never throws. It is called from
 * the middle of business transactions — after a ticket is deleted, after an
 * invoice is voided — and a logging table having a bad afternoon must not undo
 * the work the operator just did. Every failure is swallowed with a warning on
 * the server console, which is the only place it can usefully be seen.
 *
 * Rows are written, never edited or deleted from the app. Settings → Audit log
 * is the only reader.
 */

/**
 * The verbs in use. Dotted `entity.past_tense`, so a filter on the entity half
 * is a prefix match a person can guess.
 */
export type AuditAction =
  | "user.login"
  | "user.login_locked"
  | "user.logout"
  | "user.password_changed"
  | "user.password_reset"
  | "user.2fa_enabled"
  | "user.2fa_disabled"
  | "user.2fa_reset"
  | "user.invited"
  | "user.role_changed"
  | "user.deactivated"
  | "user.reactivated"
  | "settings.updated"
  | "api_key.created"
  | "api_key.revoked"
  | "ticket.deleted"
  | "customer.deleted"
  | "invoice.voided"
  | "invoice.refunded";

/** The `entity` column: the noun half of the action, used by the tab filter. */
export type AuditEntity =
  | "user"
  | "settings"
  | "api_key"
  | "ticket"
  | "customer"
  | "invoice";

export type AuditEntry = {
  shopId: string;
  /** The person who did it. Null for an anonymous act (a password reset link). */
  userId?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  /** The row it happened to, when there is one. */
  entityId?: string | null;
  /** One line, written for a shop owner: "Voided invoice #1042". */
  summary: string;
  meta?: Prisma.InputJsonValue | null;
  /** Omit to read it off the request headers, which is what almost every caller wants. */
  ip?: string | null;
};

/**
 * Writes one audit row. Awaiting it is optional — it resolves either way and
 * never rejects — but awaiting keeps the row ordered against the next one.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        shopId: entry.shopId,
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary.slice(0, 300),
        meta: entry.meta ?? undefined,
        ip: entry.ip === undefined ? await clientIp() : entry.ip,
      },
    });
  } catch (error) {
    console.warn(
      `[audit] could not record ${entry.action}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * The caller's address, as best the request headers know it.
 *
 * First hop of `x-forwarded-for` — behind a single trusted proxy that is the
 * client. Returns null off-request (a cron job, a script), which is honest.
 */
export async function clientIp(): Promise<string | null> {
  try {
    const head = await headers();
    const forwarded = head.get("x-forwarded-for");
    const candidate =
      forwarded?.split(",")[0]?.trim() || head.get("x-real-ip")?.trim() || "";
    return candidate ? candidate.slice(0, 45) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

type AuditDbRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  meta: unknown;
  ip: string | null;
  createdAt: Date;
  user: { name: string } | null;
};

function toAuditRow(row: AuditDbRow): AuditRow {
  return {
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    summary: row.summary,
    // Serialised here rather than in the browser, so the client never has to
    // guess at the shape of a Json column.
    meta:
      row.meta === null || row.meta === undefined
        ? null
        : JSON.stringify(row.meta, null, 2),
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
    actorName: row.user?.name ?? null,
  };
}

/**
 * One page of the trail, newest first.
 *
 * Reads one row more than the page size, so "Load more" only appears when
 * there is genuinely more to load. The `shopId` is always the caller's own —
 * both the settings page and the load-more action derive it from the session.
 */
export async function readAuditPage(
  shopId: string,
  filters: { entity?: string; userId?: string; cursor?: string | null } = {},
): Promise<AuditPage> {
  const rows = await db.auditLog.findMany({
    where: {
      shopId,
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      summary: true,
      meta: true,
      ip: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;

  return {
    rows: page.map(toAuditRow),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
