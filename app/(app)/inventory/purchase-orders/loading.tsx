import { PageHeaderSkeleton, RowsSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Status pills, then the vendor pills, then the order table. */
export default function PurchaseOrdersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton filters={5} />

      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <RowsSkeleton count={8} />
    </div>
  );
}
