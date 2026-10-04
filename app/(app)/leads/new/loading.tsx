import { Skeleton } from "@/components/ui/skeleton";

/**
 * A form, not the inbox — without this the boundary above would flash the
 * enquiry cards at someone who asked for a blank form.
 */
export default function NewLeadLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}
