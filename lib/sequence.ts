import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Per-shop document numbering.
 *
 * Tickets, estimates and invoices each get their own sequence starting at 1000
 * within a shop. The number is derived from max(number) + 1 inside a
 * transaction, and the DB enforces @@unique([shopId, number]) as the real
 * guarantee — so if two requests race, the loser gets a unique-violation and
 * retries rather than silently duplicating a number.
 *
 * Good enough for a single-shop-per-request workload. If contention ever shows
 * up, replace the body with a dedicated `counters` row updated via
 * `UPDATE ... RETURNING value + 1` (row lock), keeping this signature.
 */

export type SequenceKind = "ticket" | "estimate" | "invoice";

const START_AT = 1000;
const MAX_ATTEMPTS = 5;

type Tx = Prisma.TransactionClient;

async function maxNumber(tx: Tx, shopId: string, kind: SequenceKind) {
  switch (kind) {
    case "ticket": {
      const row = await tx.ticket.aggregate({
        where: { shopId },
        _max: { number: true },
      });
      return row._max.number;
    }
    case "estimate": {
      const row = await tx.estimate.aggregate({
        where: { shopId },
        _max: { number: true },
      });
      return row._max.number;
    }
    case "invoice": {
      const row = await tx.invoice.aggregate({
        where: { shopId },
        _max: { number: true },
      });
      return row._max.number;
    }
  }
}

/**
 * Returns the next document number for a shop.
 *
 * Pass `tx` when you are already inside a transaction that will create the row
 * — that keeps the read and the insert atomic.
 */
export async function nextNumber(
  shopId: string,
  kind: SequenceKind,
  tx?: Tx
): Promise<number> {
  if (tx) {
    const max = await maxNumber(tx, shopId, kind);
    return (max ?? START_AT - 1) + 1;
  }
  return db.$transaction(async (inner) => {
    const max = await maxNumber(inner, shopId, kind);
    return (max ?? START_AT - 1) + 1;
  });
}

/**
 * Runs `create` with a freshly allocated number, retrying on the unique
 * violation that a concurrent allocation would produce.
 *
 *   const ticket = await withNextNumber(shopId, "ticket", (number) =>
 *     db.ticket.create({ data: { ...input, shopId, number } })
 *   );
 */
export async function withNextNumber<T>(
  shopId: string,
  kind: SequenceKind,
  create: (number: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const number = await nextNumber(shopId, kind);
    try {
      return await create(number);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
