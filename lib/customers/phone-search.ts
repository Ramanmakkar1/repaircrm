import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Finding people by phone number.
 *
 * Numbers are stored the way they were typed — "(512) 555-0178" — so a
 * `contains` on the column can never match "5125550178", nor even the last
 * seven digits "5550178" (the stored text has a dash in the middle). Every
 * phone lookup therefore compares DIGITS to DIGITS in SQL and hands back ids,
 * which callers fold into their ordinary Prisma `where` as `{ id: { in } }`.
 */

/** Fewer digits than this is a ticket number or a house number, not a phone. */
const MIN_PHONE_DIGITS = 4;
const MAX_IDS = 50;

export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * The digits of `query` when it reads as a phone number (or a piece of one):
 * only digits and phone punctuation, and enough digits to mean something.
 * "5125550178", "555-0178" and "(512) 555" qualify; "iphone 12" does not.
 */
export function phoneQueryDigits(query: string): string | null {
  if (!/^[\d\s()+.\-]+$/.test(query)) return null;
  const digits = phoneDigits(query);
  return digits.length >= MIN_PHONE_DIGITS ? digits : null;
}

/** Ids of this shop's customers whose phone or mobile contains `digits`. */
export async function customerIdsByPhone(
  shopId: string,
  digits: string,
): Promise<string[]> {
  if (digits.length < MIN_PHONE_DIGITS) return [];
  const pattern = `%${digits}%`;
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Customer"
    WHERE "shopId" = ${shopId}
      AND (
        regexp_replace(COALESCE("mobile", ''), '\\D', '', 'g') LIKE ${pattern}
        OR regexp_replace(COALESCE("phone", ''), '\\D', '', 'g') LIKE ${pattern}
      )
    ORDER BY "updatedAt" DESC
    LIMIT ${MAX_IDS}
  `);
  return rows.map((row) => row.id);
}

/** Ids of this shop's leads whose phone contains `digits`. */
export async function leadIdsByPhone(
  shopId: string,
  digits: string,
): Promise<string[]> {
  if (digits.length < MIN_PHONE_DIGITS) return [];
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Lead"
    WHERE "shopId" = ${shopId}
      AND regexp_replace(COALESCE("phone", ''), '\\D', '', 'g') LIKE ${`%${digits}%`}
    ORDER BY "createdAt" DESC
    LIMIT ${MAX_IDS}
  `);
  return rows.map((row) => row.id);
}

/**
 * The "is this caller already a customer?" clause: same last seven digits.
 * Seven, so a country code or area code typed on one side only still matches.
 * Empty when there are too few digits to identify anybody.
 */
export async function samePhoneClause(
  shopId: string,
  phone: string | null | undefined,
): Promise<Prisma.CustomerWhereInput[]> {
  const digits = phoneDigits(phone);
  if (digits.length < 7) return [];
  const ids = await customerIdsByPhone(shopId, digits.slice(-7));
  return ids.length > 0 ? [{ id: { in: ids } }] : [];
}

/**
 * How a list screen (repairs, invoices, estimates) matches its search box
 * against the customer on each row: name, business, email, or a typed phone
 * number. Spread into the row's own `OR` as `{ customer: clause }`.
 */
export async function customerMatchClauses(
  shopId: string,
  query: string,
): Promise<Prisma.CustomerWhereInput[]> {
  const like = { contains: query, mode: "insensitive" as const };
  const phone = phoneQueryDigits(query);
  const ids = phone ? await customerIdsByPhone(shopId, phone) : [];
  return [
    { firstName: like },
    { lastName: like },
    { businessName: like },
    { email: like },
    ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
  ];
}

/**
 * `query` as a document number ("#1042", "1042"), or null. Capped at what the
 * Int column holds — a typed phone number parses as a number too, and Prisma
 * throws on one that is out of range rather than finding nothing.
 */
export function documentNumber(query: string): number | null {
  const match = /^#?(\d{1,9})$/.exec(query.trim());
  return match ? Number(match[1]) : null;
}
