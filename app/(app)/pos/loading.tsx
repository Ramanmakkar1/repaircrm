import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The register opens six queries at once — catalogue, customers, billable
 * tickets, tax rates, shop settings and the open drawer session — so the
 * counter gets the shape of the till immediately: drawer strip, scan box,
 * tiles, and the cart already in its column on the right.
 */
export default function PosLoading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeaderSkeleton />

      <Skeleton className="h-[62px] rounded-lg" />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-14 rounded-lg" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 9 }, (_, index) => (
              <Skeleton key={index} className="h-[7.5rem] rounded-lg" />
            ))}
          </div>
        </div>

        <Skeleton className="h-[30rem] rounded-lg" />
      </div>
    </div>
  );
}
