import { Skeleton } from "@/components/ui/skeleton";

/** The overview's shape while it loads: header, today row, repair tiles, then the lists. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:gap-7" aria-busy="true">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-14 w-44 rounded-2xl" />
          <Skeleton className="h-14 w-44 rounded-2xl" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <div>
        <Skeleton className="mb-3 h-7 w-56" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-36 rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="mb-1 h-7 w-44" />
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-[88px] rounded-2xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
