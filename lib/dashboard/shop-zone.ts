/**
 * The shop's time zone, read from the shop row (Settings). Server-only.
 *
 * Every screen that says "today", cuts a day or prints a time asks for this
 * first and hands it to the pure helpers in ./zone, so nothing depends on the
 * zone the server process happens to run in.
 */

import { db } from "@/lib/db";
import { safeTimeZone } from "./zone";

export async function loadShopZone(shopId: string): Promise<string> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
  return safeTimeZone(shop?.timezone);
}
