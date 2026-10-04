import { Skeleton } from "@/components/ui/skeleton";
import { readUiPrefs } from "@/lib/prefs";

/**
 * The hub fires eleven queries — repairs, invoices, estimates, payments,
 * comms, warranties and the money roll-ups — before it can paint. The frame
 * is stood up first so nothing shifts.
 *
 * Easy mode has the POS-style frame (the big header with its call button and
 * five tiles, the summary strip, the four section tabs, then the cards), so it
 * gets grey blocks in those places; Full mode keeps the object header and the
 * two columns.
 */
export default async function CustomerHubLoading() {
  if ((await readUiPrefs()).simple) return <EasyLoading />;

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

function EasyLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5">
      {/* The header: picture and name, the call row, then New repair and the four quick tiles. */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-3 sm:gap-5 sm:p-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <Skeleton className="size-16 shrink-0 rounded-full sm:size-20" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-3/5 sm:h-9" />
            <Skeleton className="h-5 w-2/5" />
          </div>
        </div>
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] sm:gap-3">
          <Skeleton className="h-20 rounded-2xl max-sm:hidden" />
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* The summary strip. */}
      <Skeleton className="h-28 rounded-2xl sm:h-40 lg:h-32" />

      {/* The section tabs, then the cards of the open section. */}
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-12 flex-1 rounded-xl sm:w-32 sm:flex-none" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    </div>
  );
}
