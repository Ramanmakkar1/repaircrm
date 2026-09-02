import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The dashboard runs seven aggregates before it can print a single number, so
 * the shell goes up immediately and the counts land in the boxes that are
 * already there — the page fills in rather than jumping.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      {/* The six headline tiles. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-[178px] rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-[196px] rounded-lg" />

      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-[232px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
