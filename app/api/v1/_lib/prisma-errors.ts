/**
 * Prisma error codes worth turning into a friendly API answer.
 *
 * Only the ones a CALLER can fix belong here. Everything else stays a 500:
 * telling an integration that a foreign key failed on a column it has never
 * heard of is noise, and guessing which of our constraints they tripped is
 * worse than admitting we broke.
 */

/** P2002 — a unique constraint was violated (duplicate SKU, duplicate number). */
export function isUniqueViolation(error: unknown): boolean {
  return code(error) === "P2002";
}

function code(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as { code?: string }).code;
}
