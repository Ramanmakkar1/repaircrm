import { Skeleton } from "@/components/ui/skeleton";

/**
 * A ticket joins ten relations and then fans out into nine more lookups, so
 * this is the slowest screen in the app to first byte. The two-column frame
 * goes up straight away and every card lands where its grey block was.
 */
export default function TicketDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-28" />

      <Skeleton className="h-[196px] rounded-lg" />
      <Skeleton className="h-[112px] rounded-lg" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Skeleton className="h-[232px] rounded-lg" />
          <Skeleton className="h-[264px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-[288px] rounded-lg" />
          <Skeleton className="h-[184px] rounded-lg" />
          <Skeleton className="h-[184px] rounded-lg" />
        </div>
      </div>
    </div>
  );
}
