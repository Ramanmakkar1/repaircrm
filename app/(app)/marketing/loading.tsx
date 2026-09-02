import { CardGridSkeleton, PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Header, the starter-template rail, then the campaign cards. */
export default function MarketingLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-24 rounded-lg" />
      <CardGridSkeleton count={3} height="h-[248px]" />
    </div>
  );
}
