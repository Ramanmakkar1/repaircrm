import { Skeleton } from "@/components/ui/skeleton";

/** Totals rail beside the lines table, matching the order the page renders in. */
export default function PurchaseOrderLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-8 w-72" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-40 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-lg lg:order-2" />
        <Skeleton className="h-96 rounded-lg lg:order-1 lg:col-span-2" />
      </div>
    </div>
  );
}
