/**
 * The last line of defence against the one Prisma behaviour that turns a small
 * bug into a wiped table.
 *
 * Prisma DROPS a key whose value is `undefined` from a `where`. So
 *
 *     db.customer.updateMany({ where: { id: customerId, shopId }, data })
 *
 * with `customerId` undefined — a client that sent fewer arguments, an
 * `entity?.id`, a renamed form field — runs as `{ shopId }` and rewrites EVERY
 * customer in the shop. The shopId filter is what makes it look careful. This
 * shipped here more than once, and a code audit found ~25 more live copies.
 *
 * Guarding each call site works until the next one is written. This guard sits
 * in the client itself (see lib/db.ts), so it covers every call site, the ones
 * inside `$transaction`, and the ones nobody has written yet: an operation that
 * narrows by row must say WHICH row, or it does not run.
 *
 * Deliberately narrow: only the key `id`, only when it is PRESENT and
 * undefined (`{ shopId }` alone is a legitimate whole-shop query and is left
 * alone), and only on the operations where a dropped key widens the blast
 * radius — bulk writes, and the `findFirst` that so often picks the row a
 * following update-by-id then changes.
 */

export const GUARDED_OPERATIONS: ReadonlySet<string> = new Set([
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
  "findFirst",
  "findFirstOrThrow",
]);

export class MissingIdError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} was called with \`id: undefined\` in its where clause. ` +
        "Prisma would have dropped the filter and matched every row, so the query was refused.",
    );
    this.name = "MissingIdError";
  }
}

/** Throws when a guarded operation names an `id` it does not have. */
export function assertIdPresent(model: string, operation: string, args: unknown): void {
  if (!GUARDED_OPERATIONS.has(operation)) return;
  if (!args || typeof args !== "object") return;
  const where = (args as { where?: unknown }).where;
  if (!where || typeof where !== "object") return;
  if (Object.prototype.hasOwnProperty.call(where, "id") && (where as { id?: unknown }).id === undefined) {
    throw new MissingIdError(model, operation);
  }
}
