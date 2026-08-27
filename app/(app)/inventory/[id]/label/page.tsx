import { redirect } from "next/navigation";

import { clampLabelCount } from "@/components/inventory/format";

/**
 * `/inventory/[id]/label` is the address people guess and bookmark; the sheet
 * itself lives under `/print` because a print view needs the bare print layout,
 * not the app shell. One redirect keeps both URLs working without a second copy
 * of the page.
 */
export default async function ProductLabelRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ count?: string }>;
}) {
  const { id } = await params;
  const { count } = await searchParams;

  redirect(`/print/labels/${id}?count=${clampLabelCount(count)}`);
}
