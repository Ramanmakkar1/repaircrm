import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * A statement re-totals every invoice and payment in the chosen period, so the
 * period picker and both tables are framed before the arithmetic lands.
 */
export default function StatementLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      <Skeleton className="h-16 rounded-lg" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[112px] rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-[320px] rounded-lg" />
      <Skeleton className="h-[240px] rounded-lg" />
    </div>
  );
}
