import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

/**
 * The list counts every customer, pages 25 of them, then rolls up open tickets
 * and outstanding balances across that page — three round trips before the
 * first card. The search row and the grid hold their places meanwhile.
 */
export default function CustomersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full max-w-sm rounded-md" />
        <Skeleton className="h-5 w-44" />
      </div>

      <CardGridSkeleton count={9} height="h-[228px]" />
    </div>
  );
}
