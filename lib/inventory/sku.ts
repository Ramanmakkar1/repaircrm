import type { Prisma } from "@prisma/client";

/**
 * Auto-generated SKUs.
 *
 * A SKU is a shop's own part number, and it is what the label barcode encodes
 * (see components/inventory/format.ts `barcodeValue`). Left blank, a product's
 * label falls back to its internal id — a meaningless code nobody can read off a
 * shelf. So when a user doesn't type one, we mint it: a short readable prefix
 * plus a running number.
 *
 * The prefix is cosmetic; the NUMBER is what's unique, and the DB's
 * @@unique([shopId, sku]) is the real guarantee. `nextSku` reads the highest
 * number already used with a prefix and returns one past it, so a race that
 * hands the same number to two adds loses on the insert and is retried by the
 * caller (see createProductCore in the inventory actions).
 */

type Tx = Prisma.TransactionClient;

/** Numbers start here so a fresh shop's first code reads SCR-1000, not SCR-1. */
const START_AT = 1000;

/**
 * A short uppercase alphanumeric prefix for a product's SKU.
 *
 * Taken from the category when there is one — that is how a shop groups its
 * stock — and otherwise from the name. Capped at four characters and stripped of
 * anything that isn't a letter or digit, so "iPhone 6 Screen" -> "IPHO" and
 * "Screens" -> "SCRE". Falls back to "SKU" for a name that is all punctuation.
 */
export function skuPrefix(name: string, category?: string | null): string {
  const source = (category?.trim() || name || "").toUpperCase();
  const cleaned = source.replace(/[^A-Z0-9]+/g, "");
  return cleaned.slice(0, 4) || "SKU";
}

/**
 * The next auto SKU for a shop, shaped `<PREFIX>-<NNNN>`.
 *
 * Must run inside the same transaction as the `product.create` that will use it,
 * so the read of "highest number so far" and the insert are atomic against other
 * adds. A returned value is only a candidate — the unique index is what makes it
 * safe, and the caller retries on the rare collision.
 */
export async function nextSku(
  tx: Tx,
  shopId: string,
  name: string,
  category?: string | null,
): Promise<string> {
  const prefix = skuPrefix(name, category);

  // Only this shop's codes with this prefix can collide, so only they are read.
  const rows = await tx.product.findMany({
    where: { shopId, sku: { startsWith: `${prefix}-` } },
    select: { sku: true },
  });

  let highest = START_AT - 1;
  for (const { sku } of rows) {
    // Everything after "PREFIX-" should be the number; anything that isn't a
    // clean integer (a hand-typed "SCR-A1") is ignored rather than trusted.
    const suffix = sku?.slice(prefix.length + 1) ?? "";
    const n = Number.parseInt(suffix, 10);
    if (String(n) === suffix && n > highest) highest = n;
  }

  return `${prefix}-${highest + 1}`;
}
