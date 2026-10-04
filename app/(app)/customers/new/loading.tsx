import { Skeleton } from "@/components/ui/skeleton";
import { readUiPrefs } from "@/lib/prefs";

/**
 * A form, not a list — and without this the nearest boundary above would flash
 * the customer *grid* skeleton at someone who asked for a blank form. Easy mode
 * draws its own shape (two boxes and five tiles on the left, "This customer" on
 * the right) so the real form lands where the grey was.
 */
export default async function NewCustomerLoading() {
  const { simple } = await readUiPrefs();

  if (simple) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-2 pb-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-5">
            <Skeleton className="h-[350px] rounded-2xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className={`h-16 rounded-2xl sm:h-28 ${index === 4 ? "col-span-2 sm:col-span-1" : ""}`} />
              ))}
            </div>
          </div>
          <Skeleton className="hidden h-[440px] rounded-2xl lg:block" />
        </div>
      </div>
    );
  }

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
