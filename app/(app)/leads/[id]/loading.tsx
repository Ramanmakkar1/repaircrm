import { Skeleton } from "@/components/ui/skeleton";

/**
 * The lead page hunts for duplicate customers by name, email and phone tail
 * before it renders, so the enquiry card and the sidebar are framed first.
 */
export default function LeadDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-3.5">
          <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-5 w-56" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[280px] rounded-lg" />
          <Skeleton className="h-[184px] rounded-lg" />
        </div>
        <Skeleton className="h-[224px] rounded-lg" />
      </div>
    </div>
  );
}
