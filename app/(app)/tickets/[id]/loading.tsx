import { Skeleton } from "@/components/ui/skeleton";

/**
 * A ticket joins ten relations and then fans out into nine more lookups, so
 * this is the slowest screen in the app to first byte. The two-column frame
 * goes up straight away and every card lands where its grey block was.
 */
export default function TicketDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* The object header: back link, then the one card that carries the
          headline figure, the status and the metadata strip. */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-[172px] rounded-lg" />
      </div>

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
