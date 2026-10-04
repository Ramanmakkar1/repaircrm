import { PictureTileGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Home, in grey: the greeting, the two big start buttons, the Needs attention
 * list, the Today strip, the three area tabs and the picture boxes, each at
 * the size and place the real Home draws them, so nothing jumps when it lands.
 */
export default function HomeLoading() {
  return (
    <div role="status" aria-label="Loading Home" className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Skeleton className="min-h-28 rounded-2xl lg:min-h-24" />
            <Skeleton className="min-h-28 rounded-2xl lg:min-h-24" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-1.5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-[88px] rounded-2xl" />
          <Skeleton className="h-[68px] rounded-2xl" />
          <PictureTileGridSkeleton count={6} />
        </div>
      </div>
    </div>
  );
}
