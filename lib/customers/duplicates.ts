import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type DuplicateCustomer = { id: string; firstName: string; lastName: string };
export function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  const key = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return key.length >= 7 ? key : "";
}
export function duplicateCheck(phone?: string | null, mobile?: string | null): string {
  return [...new Set([phoneKey(phone), phoneKey(mobile)].filter(Boolean))].sort().join(",");
}
export async function findDuplicateCustomers(shopId: string, check: string): Promise<DuplicateCustomer[]> {
  if (!check) return [];
  const keys = check.split(",");
  // Normalize existing phone strings too; imports/API customers need no backfill.
  return db.$queryRaw<DuplicateCustomer[]>(Prisma.sql`
    SELECT "id", "firstName", "lastName" FROM "Customer"
    WHERE "shopId" = ${shopId} AND EXISTS (
      SELECT 1 FROM unnest(ARRAY["phone", "mobile"]) AS number(value)
      CROSS JOIN LATERAL (SELECT regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') AS digits) normalized
      WHERE CASE WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN substr(digits, 2) ELSE digits END IN (${Prisma.join(keys)})
    ) ORDER BY "firstName", "lastName" LIMIT 5
  `);
}
