import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of an order in Easy mode (the default): the header box with its
 * title, progress line and buttons, then the line cards.
 */
export default function PurchaseOrderLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-6 w-56" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-12 w-44 rounded-md" />
          <Skeleton className="h-12 w-40 rounded-md" />
          <Skeleton className="h-12 w-28 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-7 w-40" />
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
