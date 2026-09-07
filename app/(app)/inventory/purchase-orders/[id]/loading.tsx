import { ObjectHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The PO detail page moved to `ObjectHeader` but this skeleton was still
 * drawing the header it used to have — a breadcrumb, a big title and two
 * pills — so the page visibly jumped the instant the real header landed.
 * `ObjectHeaderSkeleton` is the same silhouette /invoices/[id] loads behind.
 *
 * Below it: the totals rail beside the lines table, in the order the page
 * renders them.
 */
export default function PurchaseOrderLoading() {
  return (
    <div className="flex flex-col gap-6">
      <ObjectHeaderSkeleton />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-lg lg:order-2" />
        <Skeleton className="h-96 rounded-lg lg:order-1 lg:col-span-2" />
      </div>
    </div>
  );
}
