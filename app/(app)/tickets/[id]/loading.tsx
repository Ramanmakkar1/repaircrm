import { readUiPrefs } from "@/lib/prefs";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A ticket joins ten relations and then fans out into nine more lookups, so
 * this is the slowest screen in the app to first byte. The two-column frame
 * goes up straight away and every card lands where its grey block was.
 */
export default async function TicketDetailLoading() {
  // Easy mode has a different frame (a picture header, a status row, tabs, a side panel), so it gets its own
  // grey blocks in the same places.
  if ((await readUiPrefs()).simple) return <EasyLoading />;

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

function EasyLoading() {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_1fr] lg:gap-x-6">
      <div className="flex flex-col gap-3 lg:col-span-2">
        <Skeleton className="h-12 w-28" />
        <Skeleton className="h-64 rounded-2xl sm:h-52" />
      </div>
      <div className="grid grid-cols-3 gap-2 lg:col-start-1 lg:row-start-2 sm:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14 rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-start">
        <Skeleton className="h-14 rounded-xl max-sm:hidden" />
        <Skeleton className="h-16 rounded-2xl lg:h-72" />
        <Skeleton className="h-24 rounded-2xl lg:h-52" />
      </div>
      <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[260px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    </div>
  );
}
