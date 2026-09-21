import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";

import { assertIdPresent } from "@/lib/db-guard";

/**
 * ============================================================================
 *  MULTI-TENANCY RULE — READ BEFORE WRITING ANY QUERY
 * ============================================================================
 *
 *  RepairPilot is multi-tenant. Every tenant-owned row carries a `shopId`.
 *
 *  EVERY query in app code MUST filter by the session's `shopId`:
 *
 *      const { shopId } = await requireUser();
 *      const tickets = await db.ticket.findMany({ where: { shopId } });
 *
 *  This applies to reads AND writes:
 *
 *    - findMany / count / aggregate  -> `where: { shopId, ... }`
 *    - findUnique by id              -> use `findFirst({ where: { id, shopId } })`
 *                                       so a guessed id from another shop 404s
 *                                       instead of leaking a row.
 *    - create                        -> always set `shopId` from the session,
 *                                       NEVER from user-supplied form input.
 *    - update / delete               -> use `updateMany`/`deleteMany` with
 *                                       `{ id, shopId }`, or verify ownership
 *                                       with a scoped findFirst first.
 *
 *  Child rows without their own `shopId` (EstimateLine, InvoiceLine, Contact,
 *  PortalToken) must only ever be reached through an already-scoped parent.
 *
 *  Never trust a shopId that arrived over the wire. The session is the only
 *  source of truth for tenant identity.
 * ============================================================================
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

type HyperdriveBinding = { connectionString: string };

const getPrismaClient = cache((): PrismaClient => {
  let cloudflareEnv: unknown;
  try {
    cloudflareEnv = getCloudflareContext().env;
  } catch {
    // Outside Workers (unit tests and the optional Node/Docker runtime), use
    // Prisma's normal PostgreSQL engine and DATABASE_URL.
  }

  const log: ("warn" | "error")[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

  if (cloudflareEnv) {
    const hyperdrive = (cloudflareEnv as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
    if (!hyperdrive?.connectionString) {
      throw new Error("The Cloudflare HYPERDRIVE binding is required to access PostgreSQL.");
    }

    return guarded(
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: hyperdrive.connectionString }),
        log,
      }),
    );
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = guarded(new PrismaClient({ log }));
  }
  return globalForPrisma.prisma;
});

/**
 * Refuses a bulk write (or a findFirst) whose `where` carries `id: undefined`
 * — see lib/db-guard.ts. A query extension rather than a wrapper around `db`,
 * because extensions also apply to the `tx` client inside `$transaction`,
 * which is where half of this app's writes happen.
 */
function guarded(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertIdPresent(model, operation, args);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

// Resolve the Cloudflare binding from the current Worker request. The Proxy
// keeps the existing `db.model.method()` call sites concise.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});

// Convenience alias — some code reads better as `prisma.ticket...`
export const prisma = db;

export default db;
