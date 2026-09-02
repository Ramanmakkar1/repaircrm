import { Skeleton } from "@/components/ui/skeleton";

/**
 * A form, not a list — and without this the nearest boundary above would flash
 * the customer *grid* skeleton at someone who asked for a blank form.
 */
export default function NewCustomerLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-5 w-96" />
        </div>
      </div>

      <Skeleton className="h-[320px] rounded-lg" />
      <Skeleton className="h-[280px] rounded-lg" />
    </div>
  );
}
