import { Skeleton } from "@/components/ui/skeleton";

/**
 * Intake loads the whole customer book (with each customer's devices and live
 * warranties) before the form can render, so the form's own shape stands in
 * for it rather than a blank column.
 */
export default function NewTicketLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>
      </div>

      <Skeleton className="h-[420px] rounded-lg" />
      <Skeleton className="h-[260px] rounded-lg" />
    </div>
  );
}
