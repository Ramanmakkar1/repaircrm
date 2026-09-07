import { Skeleton } from "@/components/ui/skeleton";

/**
 * The lead page hunts for duplicate customers by name, email and phone tail
 * before it renders, so the enquiry card and the sidebar are framed first.
 */
export default function LeadDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-[160px] rounded-lg" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[184px] rounded-lg" />
        <Skeleton className="h-[136px] rounded-lg" />
      </div>
    </div>
  );
}
