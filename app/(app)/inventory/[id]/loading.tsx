import { Skeleton } from "@/components/ui/skeleton";

/** The product page's own shape: hero, stock rail beside details, two tables. */
export default function ProductLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-[320px] rounded-lg lg:order-2" />
        <Skeleton className="h-[320px] rounded-lg lg:order-1 lg:col-span-2" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    </div>
  );
}
