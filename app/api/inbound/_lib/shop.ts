import { db } from "@/lib/db";
import { emailAddress, phoneDigits } from "./inbound";

/**
 * Which shop is this message for?
 *
 * THE TENANT NEVER COMES OFF THE WIRE. A provider posts an envelope, and the
 * only thing in it we are willing to trust for tenancy is the address the
 * message was sent TO — because that address is one the shop themselves
 * configured, and we look it up rather than believe it.
 *
 * EMAIL   `Shop.settings.inboundEmail`, set by the owner in Settings →
 *         Messaging → Inbound. Matched against every recipient on the message.
 * SMS     `TWILIO_FROM`, i.e. the number this deployment sends from and
 *         therefore the number customers reply to.
 *
 * SINGLE-SHOP FALLBACK. When the deployment holds exactly one shop, an
 * unmatched message goes to it. That is not laziness: a single-tenant install
 * is the common case, "which shop" has one possible answer, and requiring the
 * owner to configure an address before their first reply can land would mean
 * losing it. The fallback disappears the moment a second shop exists, because
 * from then on guessing would mean putting one customer's message in another
 * shop's ticket list.
 */

/** Reads `settings.inboundEmail`, tolerating every shape the column can hold. */
export function readInboundEmail(settings: unknown): string {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "";
  const value = (settings as Record<string, unknown>).inboundEmail;
  return typeof value === "string" ? value.trim() : "";
}

export type ShopResolution =
  | { ok: true; shopId: string; matched: "configured" | "single-shop" }
  | { ok: false; reason: string };

/**
 * Shops are loaded and filtered in memory rather than queried.
 *
 * `settings` is a JSON blob with no index on `inboundEmail`, and the row count
 * here is "how many businesses use this install" — tens, not millions. A
 * generated column and an index would be the right answer at a scale this
 * product is not at, and would have to be maintained by every writer of that
 * blob.
 */
export async function resolveShopByEmail(
  recipients: string[],
): Promise<ShopResolution> {
  const wanted = new Set(
    recipients.map((value) => emailAddress(value)).filter(Boolean),
  );

  const shops = await db.shop.findMany({
    select: { id: true, settings: true },
    orderBy: { createdAt: "asc" },
  });

  if (shops.length === 0) return { ok: false, reason: "no shops" };

  for (const shop of shops) {
    const configured = readInboundEmail(shop.settings).toLowerCase();
    if (configured && wanted.has(configured)) {
      return { ok: true, shopId: shop.id, matched: "configured" };
    }
  }

  if (shops.length === 1) {
    return { ok: true, shopId: shops[0].id, matched: "single-shop" };
  }

  return {
    ok: false,
    reason:
      "no shop has that address as its inbound email (Settings → Messaging → Inbound)",
  };
}

export async function resolveShopBySms(to: string): Promise<ShopResolution> {
  const twilioFrom = process.env.TWILIO_FROM?.trim();

  const shops = await db.shop.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (shops.length === 0) return { ok: false, reason: "no shops" };

  // One number per deployment today, so a match on TWILIO_FROM identifies the
  // install rather than a particular shop — with several shops there is no way
  // to tell them apart from a number they all share, and we say so instead of
  // picking one.
  if (twilioFrom && phoneDigits(to) === phoneDigits(twilioFrom)) {
    if (shops.length === 1) {
      return { ok: true, shopId: shops[0].id, matched: "configured" };
    }
    return {
      ok: false,
      reason:
        "TWILIO_FROM is shared by several shops — give each shop its own number and deployment",
    };
  }

  if (shops.length === 1) {
    return { ok: true, shopId: shops[0].id, matched: "single-shop" };
  }

  return { ok: false, reason: "no shop uses that number" };
}
