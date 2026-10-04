import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";
import { readUiPrefs } from "@/lib/prefs";

/**
 * A form, not the hub — without this the boundary above would flash the
 * customer *hub* skeleton over what is really one card of inputs.
 *
 * Easy mode draws the Easy edit page's own shape (the breadcrumb and title,
 * then the two big boxes and the five section tiles on the left and "This
 * customer" on the right), the same blocks as the New customer page, so the
 * real form lands where the grey was. Full mode keeps the one-column form.
 */
export default async function EditCustomerLoading() {
  const { simple } = await readUiPrefs();

  if (simple) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-2 pb-1">
          <Skeleton className="h-4 w-56" />
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
      <PageHeaderSkeleton />

      <Skeleton className="h-[320px] rounded-lg" />
      <Skeleton className="h-[280px] rounded-lg" />
    </div>
  );
}
