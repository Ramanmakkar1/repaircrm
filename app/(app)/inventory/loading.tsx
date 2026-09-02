import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The catalogue counts and pages before it can draw a single card, so the
 * chrome — header, the four stock pills, the search row — is painted straight
 * away and only the grid arrives late.
 */
export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton filters={4} />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 w-full max-w-sm rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>

      <Skeleton className="h-5 w-48" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-[224px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
