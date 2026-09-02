import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The board counts the whole filtered set, resolves which tickets are owed a
 * reply, then pages 25 cards — so the filter rail and the grid are painted at
 * the real rhythm first and the cards land where the grey blocks were.
 */
export default function TicketsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton filters={6} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <Skeleton key={index} className="h-[232px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
