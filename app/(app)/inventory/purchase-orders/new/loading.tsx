import { Skeleton } from "@/components/ui/skeleton";

/**
 * This one is worth a skeleton in its own right: the form cannot render until
 * the whole active catalogue has been read for the line picker.
 */
export default function NewPurchaseOrderLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-36" />
        {/* The header's 44px icon tile sits beside the title from `sm` up. */}
        <div className="flex items-center gap-3.5">
          <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
      </div>
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}
