import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The calendar loads the week, today's bookings and the pickers (up to 500
 * customers and repairs) before it can draw. The shell holds the shape of the
 * page: the views and arrows, the seven day chips, the staff row, then the
 * visits, so nothing jumps when they arrive.
 */
export default function AppointmentsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeaderSkeleton />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-12 w-72 rounded-xl" />
        <Skeleton className="h-12 w-80 rounded-xl" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-[4.5rem] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 w-full max-w-xl rounded-xl" />

      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </div>
  );
}
