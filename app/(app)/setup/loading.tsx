import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * /setup is the first screen a new owner ever sees, and it counts their team,
 * their products and their tickets before it can draw a single card. Painting
 * the five-step shell first means the wizard fills in rather than arriving.
 */
export default function SetupLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      <Skeleton className="h-2 w-full rounded-full" />

      <div className="flex flex-col gap-4">
        <Skeleton className="h-[260px] rounded-lg" />
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
