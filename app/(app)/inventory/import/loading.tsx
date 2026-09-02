import { Skeleton } from "@/components/ui/skeleton";

/** The wizard opens on step 1, so the step rail and the drop zone are the shape. */
export default function ImportProductsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        {/* The header's 44px icon tile sits beside the title from `sm` up. */}
        <div className="flex items-center gap-3.5">
          <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-60" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-32 rounded-full" />
        ))}
      </div>

      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}
