import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-28 rounded-lg lg:h-24" />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Skeleton className="mb-4 h-7 w-48" />
          <Skeleton className="mb-4 h-10 w-full max-w-lg" />
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-[188px] rounded-lg" />)}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[288px] rounded-lg" />
          <Skeleton className="h-[160px] rounded-lg" />
          <Skeleton className="h-[160px] rounded-lg" />
        </div>
      </div>
    </div>
  );
}
