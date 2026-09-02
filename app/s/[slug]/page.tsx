import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Phone } from "lucide-react";

import { db } from "@/lib/db";
import { ICONS } from "@/components/ui/icons";
import { readCheckinSettings } from "@/components/settings/checkin-meta";
import {
  addressLine,
  mapLink,
  readPublicHub,
} from "@/components/settings/hub-meta";
import { HubCards } from "./hub-cards";

/**
 * THE ONE LINK — `/s/<shop slug>`.
 *
 * This is the single URL a shop hands out: on their website, on their Google
 * listing, at the bottom of a receipt, on the sticker in the window, in a
 * WhatsApp reply. Everything a customer might want is on it as one obvious tap,
 * and nothing else is: no marketing, no pricing, no "about us".
 *
 * NO SESSION, BY DESIGN — the same three rules as the check-in desk it links to
 * (see app/checkin/[slug]/page.tsx):
 *
 *   · The tenant is the SLUG in the URL, re-resolved here on every request.
 *   · A shop that has not switched the hub on 404s. Not a "coming soon" page —
 *     an un-enabled slug is indistinguishable from one that never existed.
 *   · `noindex` unless the owner explicitly opted in. A half-configured shop
 *     link in a search result is a support call, so the default is off and the
 *     switch lives next to the link on the Connect screen.
 *
 * The two lookup cards ("check my repair", "pay a bill") answer identically
 * whether or not anything matched — see app/api/hub/lookup/route.ts, which is
 * where that promise is actually kept.
 *
 * `?embed=1` is the mode the one-line website snippet frames (see
 * app/embed.js/route.ts): it drops the page's own header, because the shop's
 * site already says whose shop this is, and lets the widget size itself.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function loadShop(slug: string) {
  const shop = await db.shop.findUnique({
    where: { slug: slug.toLowerCase() },
    select: {
      name: true,
      phone: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      settings: true,
    },
  });
  if (!shop) return null;

  const hub = readPublicHub(shop.settings);
  if (!hub.enabled) return null;

  return { shop, hub, checkin: readCheckinSettings(shop.settings) };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadShop(slug);

  // A 404 still needs a title, and it must not be the shop's — the page is
  // about to claim the shop does not exist.
  if (!loaded) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  return {
    title: loaded.shop.name,
    description: `Check in a device, follow a repair, or pay a bill with ${loaded.shop.name}.`,
    robots: loaded.hub.indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
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
  const address = addressLine(shop);

  return (
    /*
     * `min-h-dvh` is right for a page and wrong for a widget: inside the embed
     * the frame's own height IS the viewport height, so a full-height root
     * would report itself as exactly as tall as the box it is trying to grow —
     * the measurement below would never move. Embedded, the root is only as
     * tall as its content, and that is what gets posted out.
     */
    <div
      id="rf-hub-root"
      className={
        embed
          ? "bg-background pb-4 text-foreground"
          : "min-h-dvh bg-background text-foreground"
      }
    >
      {/* Inside the embed the host page has already introduced the shop; a
          second name band there reads as a page-within-a-page. */}
      {embed ? null : (
        <header className="border-b border-border bg-surface">
          <div className="mx-auto max-w-2xl px-5 py-5">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">
              {shop.name}
            </h1>
            <div className="mt-2.5 flex flex-col gap-1.5 text-[14px] text-muted-foreground">
              {address ? (
                <a
                  href={mapLink(`${shop.name}, ${address}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-start gap-2 hover:text-foreground"
                >
                  <ICONS.location className="mt-0.5 size-4 shrink-0" />
                  <span className="underline-offset-2 hover:underline">{address}</span>
                </a>
              ) : null}
              {shop.phone ? (
                <a
                  href={`tel:${shop.phone.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-2 hover:text-foreground"
                >
                  <Phone className="size-4 shrink-0" />
                  <span className="underline-offset-2 hover:underline">
                    {shop.phone}
                  </span>
                </a>
              ) : null}
              {hub.hours.trim() ? (
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-4 shrink-0" />
                  <span className="whitespace-pre-line">{hub.hours.trim()}</span>
                </div>
              ) : null}
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto w-full max-w-2xl px-5 py-6 sm:py-8">
        <HubCards
          slug={slug.toLowerCase()}
          shopName={shop.name}
          shopPhone={shop.phone}
          checkinEnabled={checkin.enabled}
          cards={hub.cards}
          embed={embed}
        />
      </main>
    </div>
  );
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
