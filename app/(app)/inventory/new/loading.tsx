import { Skeleton } from "@/components/ui/skeleton";

/** Same narrow column as the edit form, so the two screens feel like one. */
export default function NewProductLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        {/* The header's 44px icon tile sits beside the title from `sm` up. */}
        <div className="flex items-center gap-3.5">
          <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-5 w-80" />
          </div>
        </div>
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
