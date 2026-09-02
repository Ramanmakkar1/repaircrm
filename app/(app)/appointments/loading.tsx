import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The calendar loads the week, today's bookings and three pickers (up to 500
 * customers and tickets each) before it can draw. The grid is a fixed 12-hour
 * height, so the shell is an exact stand-in rather than an approximation.
 */
export default function AppointmentsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      <Skeleton className="h-[104px] rounded-lg" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-10 rounded-md" />
          <Skeleton className="size-10 rounded-md" />
          <Skeleton className="h-10 w-20 rounded-md" />
          <Skeleton className="ml-1 h-5 w-44" />
        </div>
        <Skeleton className="h-11 w-40 rounded-full" />
      </div>

      <Skeleton className="hidden h-[832px] rounded-lg md:block" />
      <Skeleton className="h-[240px] rounded-lg" />
    </div>
  );
}
