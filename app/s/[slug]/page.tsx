import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicShell, ShopContact } from "@/components/public/shell";
import { readCheckinSettings } from "@/components/settings/checkin-meta";
import { readPublicHub } from "@/components/settings/hub-meta";
import { db } from "@/lib/db";
import { PUBLIC_SHOP_SELECT, publicShop } from "@/lib/portal-display";
import { HubCards } from "./hub-cards";

/**
 * THE ONE LINK: `/s/<shop slug>`.
 *
 * This is the single URL a shop hands out: on their website, on their Google
 * listing, at the bottom of a receipt, on the sticker in the window, in a
 * WhatsApp reply. Everything a customer might want is on it as one picture box
 * each, and nothing else is: no marketing, no pricing, no "about us".
 *
 * NO SESSION, BY DESIGN: the same three rules as the check-in desk it links to
 * (see app/checkin/[slug]/page.tsx):
 *
 *   · The tenant is the SLUG in the URL, re-resolved here on every request.
 *   · A shop that has not switched the page on gets the friendly root 404:
 *     an un-enabled slug is indistinguishable from one that never existed.
 *   · `noindex` unless the owner explicitly opted in. A half-configured shop
 *     link in a search result is a support call, so the default is off and the
 *     switch lives next to the link on the Connect screen.
 *
 * The two lookup boxes ("check my repair", "pay a bill") answer identically
 * whether or not anything matched: see app/api/hub/lookup/route.ts, which is
 * where that promise is actually kept.
 *
 * `?embed=1` is the mode the one-line website snippet frames (see
 * app/embed.js/route.ts): it drops the page's own header and footer, because
 * the shop's site already says whose shop this is, and lets the widget size
 * itself.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function loadShop(slug: string) {
  const row = await db.shop.findUnique({
    where: { slug: slug.toLowerCase() },
    select: PUBLIC_SHOP_SELECT,
  });
  if (!row) return null;

  const hub = readPublicHub(row.settings);
  if (!hub.enabled) return null;

  return { shop: publicShop(row), hub, checkin: readCheckinSettings(row.settings) };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadShop(slug);

  // A 404 still needs a title, and it must not be the shop's: the page is
  // about to say the shop does not exist.
  if (!loaded) {
    return { title: "Page not found", robots: { index: false, follow: false } };
  }

  return {
    title: loaded.shop.name,
    description: `Check in a device, follow a repair, or pay a bill with ${loaded.shop.name}.`,
    robots: loaded.hub.indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function ShopHubPage({
  params,
  searchParams,
}: Params & {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const loaded = await loadShop(slug);
  if (!loaded) notFound();

  const { shop, hub, checkin } = loaded;
  const embed = one(query.embed) === "1";

  const cards = (
    <HubCards
      slug={slug.toLowerCase()}
      shopName={shop.name}
      shopPhone={shop.phone}
      checkinEnabled={checkin.enabled}
      cards={hub.cards}
      embed={embed}
    />
  );

  /*
   * `min-h-dvh` is right for a page and wrong for a widget: inside the embed
   * the frame's own height IS the viewport height, so a full-height root would
   * report itself as exactly as tall as the box it is trying to grow, and the
   * measurement in HubCards would never move. Embedded, the root is only as
   * tall as its content, and that is what gets posted out.
   */
  if (embed) {
    return (
      <div id="rf-hub-root" className="w-full bg-background px-4 pb-4 pt-2 text-foreground">
        {cards}
      </div>
    );
  }

  return (
    <PublicShell shop={shop} eyebrow="Repairs and help" hideContact>
      <div id="rf-hub-root" className="flex flex-col gap-8">
        <ShopContact shop={shop} title={null} className="rounded-2xl border border-border bg-surface p-4 sm:p-6" />
        {cards}
      </div>
    </PublicShell>
  );
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
