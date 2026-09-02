import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The clock-in button is the reason anybody opens this page, so its box holds
 * its full height in grey rather than letting the card below jump up into it.
 */
export default function TimeClockLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-[152px] rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
