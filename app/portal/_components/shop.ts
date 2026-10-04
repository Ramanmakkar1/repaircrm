import { cache } from "react";

import { readCheckinSettings } from "@/components/settings/checkin-meta";
import { readPublicHub } from "@/components/settings/hub-meta";
import { db } from "@/lib/db";
import { PUBLIC_SHOP_SELECT, publicShop, type PublicShop } from "@/lib/portal-display";

/**
 * The shop's public face for a portal page: name, logo, phone, address, hours
 * and time zone.
 *
 * `shopId` always comes from the portal cookie (requirePortalCustomer or the
 * session itself), never from the URL, so this can only ever read the
 * signed-in customer's own shop. Cached per request: the shell and the page
 * body both ask for it.
 */
export const loadPortalShop = cache(async (shopId: string): Promise<PublicShop> => {
  const row = await db.shop.findUnique({ where: { id: shopId }, select: PUBLIC_SHOP_SELECT });
  return publicShop(row ?? { name: "Your repair shop" });
});

/**
 * A shop named by slug in a link (`/portal?shop=<slug>`), for the sign-in page
 * to say whose repairs these are. Only a shop that already shows itself in
 * public (its shop page or its check-in desk is switched on) is returned: an
 * unused slug must read exactly like one that never existed.
 */
export async function loadPublicShopBySlug(
  slug: string,
): Promise<{ shop: PublicShop; slug: string; statusLookup: boolean } | null> {
  const clean = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(clean)) return null;
  const row = await db.shop.findUnique({ where: { slug: clean }, select: PUBLIC_SHOP_SELECT });
  if (!row) return null;
  const hub = readPublicHub(row.settings);
  if (!hub.enabled && !readCheckinSettings(row.settings).enabled) return null;
  return { shop: publicShop(row), slug: clean, statusLookup: hub.enabled && hub.cards.status };
}
