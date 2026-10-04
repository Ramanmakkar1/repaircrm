import { Skeleton } from "@/components/ui/skeleton";

/** The supplier in Easy mode: the header box with its buttons, then order cards and part cards. */
export default function VendorLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 shrink-0 rounded-full sm:size-20" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-12 w-36 rounded-md" />
          <Skeleton className="h-12 w-28 rounded-md" />
          <Skeleton className="h-12 w-28 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-7 w-52" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-7 w-60" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </div>
  );
}
