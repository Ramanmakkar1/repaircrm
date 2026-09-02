import { Skeleton } from "@/components/ui/skeleton";

/**
 * The importer is a wizard, not a grid — without this the boundary above
 * would flash the customer card grid before the first step appears.
 */
export default function ImportCustomersLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-96" />
        </div>
      </div>

      <Skeleton className="h-[380px] rounded-lg" />
    </div>
  );
}
