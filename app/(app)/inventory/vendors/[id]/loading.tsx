import { Skeleton } from "@/components/ui/skeleton";

/** Contact card beside the supplied-products table, orders underneath. */
export default function VendorLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-8 w-64" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-36 rounded-full" />
          <Skeleton className="h-7 w-44 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
      </div>

      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
