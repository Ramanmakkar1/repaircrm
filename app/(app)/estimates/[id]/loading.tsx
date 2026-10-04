import { readUiPrefs } from "@/lib/prefs";
import { BillDetailSkeleton, DocumentDetailSkeleton } from "@/components/billing/skeletons";

/**
 * Easy mode (the default) opens on the POS-style bill, so its grey is the bill's
 * shape; Full mode keeps the old header-and-aside silhouette. The shell already
 * reads this same cookie on every request, so reading it here is free.
 */
export default async function EstimateDetailLoading() {
  const { simple } = await readUiPrefs();
  return simple ? <BillDetailSkeleton /> : <DocumentDetailSkeleton header="object" />;
}
