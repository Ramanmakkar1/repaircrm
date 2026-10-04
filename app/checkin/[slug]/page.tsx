import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { deviceKindsFor, kindPicture, problemPicturesFor, visibleDeviceKinds } from "@/lib/intake-options";
import { PUBLIC_SHOP_SELECT, publicShop } from "@/lib/portal-display";
import { problemTypes } from "@/components/tickets/ticket-meta";
import { readCheckinSettings } from "@/components/settings/checkin-meta";
import { readPublicHub } from "@/components/settings/hub-meta";
import { CheckinForm } from "./checkin-form";

export const dynamic = "force-dynamic";

/**
 * The public check-in desk: /checkin/<shop slug>.
 *
 * NO SESSION, BY DESIGN, and therefore three rules:
 *
 *   · The tenant is the SLUG in the URL. That is safe because this page only
 *     ever leads to a CREATE for that shop; it reads nothing back beyond the
 *     shop's own name, contact and its intake boxes, all of which is already
 *     on the shop's public page.
 *   · A shop that has not switched check-in on 404s (the friendly root page).
 *     An un-enabled slug is indistinguishable from a slug that does not exist.
 *   · `robots: noindex`. A check-in form in a search result is a support call.
 *
 * `?kiosk=1` is the counter-tablet mode: bigger type, no links off the page,
 * and the done screen clears itself for the next person in the queue.
 */

/**
 * The shop's own name in the tab, because this page is the shop's front
 * counter, not Repairs helper's. `noindex` stays whatever the slug turns out to
 * be: an unknown one must not look different from a disabled one.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await db.shop.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { name: true, settings: true },
  });
  const live = shop && readCheckinSettings(shop.settings).enabled;
  return {
    title: live ? `Check in a device · ${shop.name}` : "Check in a device",
    robots: { index: false, follow: false },
  };
}

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const row = await db.shop.findUnique({
    where: { slug: slug.toLowerCase() },
    select: PUBLIC_SHOP_SELECT,
  });
  if (!row) notFound();

  const checkin = readCheckinSettings(row.settings);
  if (!checkin.enabled) notFound();

  const problems = problemTypes(row.settings);
  const hub = readPublicHub(row.settings);

  return (
    <CheckinForm
      slug={slug.toLowerCase()}
      shop={publicShop(row)}
      kinds={visibleDeviceKinds(deviceKindsFor(row.settings)).map((kind) => ({
        label: kind.label,
        type: kind.type,
        photo: kindPicture(kind)?.image ?? null,
      }))}
      problemTypes={problems}
      problemPictures={problemPicturesFor(row.settings, problems)}
      terms={checkin.terms}
      fields={checkin.fields}
      kiosk={one(query.kiosk) === "1"}
      hubLive={hub.enabled && hub.cards.status}
    />
  );
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
