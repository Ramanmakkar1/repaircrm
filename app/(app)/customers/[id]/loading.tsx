import { Skeleton } from "@/components/ui/skeleton";

/**
 * The hub fires eleven queries — tickets, invoices, estimates, payments,
 * comms, warranties and the money roll-ups — before it can paint. The object
 * header and both columns are stood up first so nothing shifts.
 */
export default function CustomerHubLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-[172px] rounded-lg" />
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
