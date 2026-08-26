import { PrismaClient } from "@prisma/client";

/**
 * ============================================================================
 *  MULTI-TENANCY RULE — READ BEFORE WRITING ANY QUERY
 * ============================================================================
 *
 *  RepairFlow is multi-tenant. Every tenant-owned row carries a `shopId`.
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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Convenience alias — some code reads better as `prisma.ticket...`
export const prisma = db;

export default db;
