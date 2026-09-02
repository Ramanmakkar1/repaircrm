import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { problemTypes } from "@/components/tickets/ticket-meta";
import { readCheckinSettings } from "@/components/settings/checkin-meta";
import { CheckinForm } from "./checkin-form";

export const dynamic = "force-dynamic";

/**
 * The public check-in desk: /checkin/<shop slug>.
 *
 * NO SESSION, BY DESIGN — and therefore three rules:
 *
 *   · The tenant is the SLUG in the URL. That is safe because this page only
 *     ever leads to a CREATE for that shop; it reads nothing back beyond the
 *     shop's own name and its intake vocabulary, all of which is already on the
 *     shop's website.
 *   · A shop that has not switched check-in on 404s. Not a friendly "coming
 *     soon" page — an un-enabled slug should be indistinguishable from a slug
 *     that does not exist.
 *   · `robots: noindex`. A check-in form in a search result is a support call.
 *
 * `?kiosk=1` is the counter-tablet mode: bigger targets, no links off the page,
 * and the confirmation clears itself for the next person in the queue.
 */
/**
 * The shop's own name in the tab, because this page is the shop's front
 * counter, not RepairFlow's. `noindex` stays whatever the slug turns out to be
 * — an unknown one must not look different from a disabled one.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await db.shop.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { name: true },
  });
  return {
    title: shop ? `Check in a device · ${shop.name}` : "Check in a device",
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

  const shop = await db.shop.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, name: true, phone: true, settings: true },
  });
  if (!shop) notFound();

  const checkin = readCheckinSettings(shop.settings);
  if (!checkin.enabled) notFound();

  // The device types this shop actually sees, as picker suggestions. It stays a
  // free-text field: the first Framework laptop through the door should not
  // have to be called "Other".
  const assetTypes = await db.asset.findMany({
    where: { shopId: shop.id },
    distinct: ["type"],
    orderBy: { type: "asc" },
    take: 40,
    select: { type: true },
  });

  const kiosk = one(query.kiosk) === "1";

  return (
    <CheckinForm
      slug={slug.toLowerCase()}
      shopName={shop.name}
      shopPhone={shop.phone}
      deviceTypes={assetTypes.map((asset) => asset.type)}
      problemTypes={problemTypes(shop.settings)}
      terms={checkin.terms}
      fields={checkin.fields}
      kiosk={kiosk}
    />
  );
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
