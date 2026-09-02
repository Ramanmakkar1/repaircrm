import { db } from "@/lib/db";

import type { ProviderName, SyncEntity } from "./types";
import { SYNC_ENTITIES } from "./types";

/**
 * IntegrationLink — the record of "this local row is that remote row".
 *
 * It is the whole idempotency story. Nothing about a push is inferred from
 * timestamps or names: a row with a link has been written to the provider, a
 * row without one has not, and the unique index on
 * `(shopId, provider, entity, entityId)` makes a duplicate physically
 * impossible even if two passes overlap.
 *
 * `meta` carries the provider's own bookkeeping for that row — QuickBooks
 * hands back a SyncToken that must be echoed on every subsequent write, and a
 * DisplayName we may have had to disambiguate. Never business data: the local
 * row remains the source of truth for everything a human typed.
 */

export type LinkMeta = {
  /** QuickBooks optimistic-concurrency token; must be echoed on every write. */
  syncToken?: string;
  /** The name actually accepted by the provider, when it differs from ours. */
  remoteName?: string;
  /** Xero item code, which is its own identifier alongside the GUID. */
  code?: string;
  /** Set once a voided invoice has been voided in the provider too. */
  voidedAt?: string;
};

export type Link = {
  entityId: string;
  remoteId: string;
  meta: LinkMeta;
  syncedAt: Date;
};

function readMeta(value: unknown): LinkMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LinkMeta;
}

/** Every link this shop holds for one entity, keyed by local id. */
export async function loadLinks(
  shopId: string,
  provider: ProviderName,
  entity: SyncEntity,
): Promise<Map<string, Link>> {
  const rows = await db.integrationLink.findMany({
    where: { shopId, provider, entity },
    select: { entityId: true, remoteId: true, meta: true, syncedAt: true },
  });

  return new Map(
    rows.map((row) => [
      row.entityId,
      {
        entityId: row.entityId,
        remoteId: row.remoteId,
        meta: readMeta(row.meta),
        syncedAt: row.syncedAt,
      },
    ]),
  );
}

/**
 * Records (or refreshes) the mapping for one row.
 *
 * `upsert` on the composite unique index rather than a find-then-create: two
 * passes racing on the same row then collide in Postgres, where one of them
 * wins cleanly, instead of both creating a link and one of them exploding.
 */
export async function saveLink(
  shopId: string,
  provider: ProviderName,
  entity: SyncEntity,
  entityId: string,
  remoteId: string,
  meta: LinkMeta = {},
): Promise<void> {
  await db.integrationLink.upsert({
    where: {
      shopId_provider_entity_entityId: { shopId, provider, entity, entityId },
    },
    create: {
      shopId,
      provider,
      entity,
      entityId,
      remoteId,
      meta: meta as never,
      syncedAt: new Date(),
    },
    update: { remoteId, meta: meta as never, syncedAt: new Date() },
  });
}

/** How many rows of each kind this shop has pushed. Drives the settings card. */
export async function linkCounts(
  shopId: string,
  provider: ProviderName,
): Promise<Record<SyncEntity, number>> {
  const grouped = await db.integrationLink.groupBy({
    by: ["entity"],
    where: { shopId, provider },
    _count: { _all: true },
  });

  const counts = {} as Record<SyncEntity, number>;
  for (const entity of SYNC_ENTITIES) counts[entity] = 0;
  for (const row of grouped) {
    if ((SYNC_ENTITIES as readonly string[]).includes(row.entity)) {
      counts[row.entity as SyncEntity] = row._count._all;
    }
  }
  return counts;
}

/**
 * Drops every mapping for a provider.
 *
 * Deliberately NOT called on disconnect: reconnecting the same QuickBooks
 * company after an accidental disconnect would otherwise duplicate every
 * invoice the shop has ever issued. Links are only cleared when an operator
 * explicitly connects a DIFFERENT company, where the old remote ids are
 * genuinely meaningless.
 */
export async function clearLinks(
  shopId: string,
  provider: ProviderName,
): Promise<number> {
  const { count } = await db.integrationLink.deleteMany({
    where: { shopId, provider },
  });
  return count;
}
