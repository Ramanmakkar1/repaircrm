import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Back-link, header, then the three-up grid of drawer sessions. */
export default function DrawersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-40" />

      <PageHeaderSkeleton />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[268px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
