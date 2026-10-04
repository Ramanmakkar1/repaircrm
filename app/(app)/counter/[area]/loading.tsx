import { PictureTileGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/** A hub (Money, Stock, More tools...) in grey: its picture and title, then the picture boxes. */
export default function HubLoading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-center gap-4 sm:gap-5">
        <Skeleton className="size-24 shrink-0 rounded-xl sm:size-28" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
      </div>
      <PictureTileGridSkeleton count={6} />
    </div>
  );
}
