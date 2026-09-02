import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * "The customer wrote in and nobody has answered."
 *
 * THE RULE, in one sentence: a ticket needs a reply when `lastInboundAt` — the
 * stamp put there by an inbound email or text (see app/api/inbound) — is newer
 * than the most recent PUBLIC comment written by a member of staff.
 *
 * Three parts of that are load-bearing:
 *
 *   · PUBLIC. An internal note is techs talking to each other; the customer
 *     never sees it, so it does not answer them.
 *   · BY STAFF. `authorId IS NOT NULL` is what distinguishes a reply from the
 *     customer's own message, which is stored with no author precisely so this
 *     comparison can be made.
 *   · NEWER. Not "has a reply ever been sent" — a conversation goes back and
 *     forth, and the last word being theirs is what makes it outstanding.
 *
 * WHY RAW SQL: the comparison is between a column on the ticket and an
 * aggregate over its children, which Prisma's query builder cannot express. The
 * alternative is loading every open ticket with its comments and filtering in
 * JavaScript, which is a page-sized read to answer a question about a handful
 * of rows.
 */

/**
 * Ids of the tickets in this shop that are waiting on us.
 *
 * Returned as a set of ids rather than whole rows so the caller can use it two
 * ways at once — as a filter (`where: { id: { in: [...] } }`) and as a lookup
 * for the dot on each card — from a single query.
 */
export async function needsReplyTicketIds(shopId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT t."id"
    FROM "Ticket" t
    WHERE t."shopId" = ${shopId}
      AND t."lastInboundAt" IS NOT NULL
      AND t."lastInboundAt" > COALESCE(
        (
          SELECT MAX(c."createdAt")
          FROM "TicketComment" c
          WHERE c."ticketId" = t."id"
            AND c."isPublic" = TRUE
            AND c."authorId" IS NOT NULL
        ),
        TIMESTAMP 'epoch'
      )
  `);

  return rows.map((row) => row.id);
}
