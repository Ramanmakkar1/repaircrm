import { db } from "@/lib/db";

/**
 * The shop block every print sheet puts in its masthead.
 *
 * Deliberately separate from `loadShopHeader` in queries.ts: the printed
 * masthead needs `logoUrl`, which the on-screen document forms have no use for,
 * and a print sheet should not be the reason an unrelated form re-renders when
 * that select changes. Server-only — it pulls in Prisma.
 */
export async function loadPrintShop(shopId: string) {
  return db.shop.findUnique({
    where: { id: shopId },
    select: {
      name: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      logoUrl: true,
      timezone: true,
      taxRateBps: true,
    },
  });
}

/** Drops empty parts and joins the rest — no stray commas on a printed address. */
export function addressLines(parts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
}): string[] {
  const cityLine = [parts.city, parts.state].filter(Boolean).join(", ");
  const locality = [cityLine, parts.postalCode].filter(Boolean).join(" ");
  return [
    parts.address1,
    parts.address2,
    locality,
    parts.phone,
    parts.email,
  ].filter((line): line is string => Boolean(line && line.trim()));
}
