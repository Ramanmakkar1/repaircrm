import { Skeleton } from "@/components/ui/skeleton";

/**
 * The hub fires eleven queries — tickets, invoices, estimates, payments,
 * comms, warranties and the money roll-ups — before it can paint. The hero,
 * the stats strip and both columns are stood up first so nothing shifts.
 */
export default function CustomerHubLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[136px] rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-[104px] rounded-lg" />
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[280px] rounded-lg" />
          <Skeleton className="h-[168px] rounded-lg" />
          <Skeleton className="h-[168px] rounded-lg" />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[240px] rounded-lg" />
          <Skeleton className="h-[240px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
        </div>
      </div>
    </div>
  );
}
