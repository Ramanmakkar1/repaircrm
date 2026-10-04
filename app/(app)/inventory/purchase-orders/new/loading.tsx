import { Skeleton } from "@/components/ui/skeleton";

/**
 * Worth a skeleton in its own right: the screen cannot draw until the whole
 * active catalogue has been read for the picture tiles. The shape of New order:
 * title, the three step boxes, the supplier tiles, and the order panel beside them.
 */
export default function NewPurchaseOrderLoading() {
  return (
    <div className="mx-auto grid w-full max-w-7xl items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-full max-w-96" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-2xl" />
          ))}
        </div>
      </div>
      <Skeleton className="hidden h-[28rem] rounded-2xl lg:block" />
    </div>
  );
}
