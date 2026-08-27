import { Skeleton } from "@/components/ui/skeleton";

/**
 * The report runs a dozen aggregates, so the shell is painted immediately and
 * the numbers land when they land — the operator sees the page they asked for
 * rather than a blank screen and a spinner.
 */
export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-64" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-10 w-32 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[152px] rounded-lg" />
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    </div>
  );
}
