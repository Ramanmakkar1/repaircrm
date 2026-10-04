import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { clampLabelCount } from "@/components/inventory/format";
import { asLabelSize } from "@/components/inventory/label-sizes";

/** A readable tab title for the moment before the redirect lands. */
export const metadata: Metadata = { title: "Shelf labels · Repairs helper" };

/**
 * `/inventory/[id]/label` is the address people guess and bookmark; the sheet
 * itself lives under `/print` because a print view needs the bare print layout,
 * not the app shell. One redirect keeps both URLs working without a second copy
 * of the page. The count and size ride along.
 */
export default async function ProductLabelRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ count?: string; size?: string }>;
}) {
  const { id } = await params;
  const { count, size } = await searchParams;
  const shape = asLabelSize(size);

  redirect(`/print/labels/${id}?count=${clampLabelCount(count)}${shape === "sheet" ? "" : `&size=${shape}`}`);
}
