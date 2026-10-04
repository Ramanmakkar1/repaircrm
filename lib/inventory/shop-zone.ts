import { safeTimeZone } from "@/lib/dashboard/logic";
import { db } from "@/lib/db";

/**
 * The shop's own time zone (Shop.timezone), for the stock and purchasing pages:
 * "late", "today" and every printed time follow the shop, never the server.
 * One row by primary key; a bad or missing value falls back to UTC rather than
 * breaking the page.
 */
export async function shopZone(shopId: string): Promise<string> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
  return safeTimeZone(shop?.timezone);
}
