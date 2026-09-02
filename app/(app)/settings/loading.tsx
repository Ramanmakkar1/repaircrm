import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Settings opens with a fourteen-query batch plus two live Stripe round trips,
 * so it is the slowest screen in the app to first paint. The rail and the first
 * panel are drawn immediately at their real widths — 224px column, cards on the
 * right — so the panel lands where the grey was instead of shunting sideways.
 */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        {/* The rail: five groups on a laptop, a strip of pills on a phone. */}
        <div className="flex shrink-0 gap-1 overflow-hidden lg:w-56 lg:flex-col lg:gap-4">
          {[4, 2, 1, 4, 2].map((rows, group) => (
            <div key={group} className="flex shrink-0 gap-1 lg:flex-col">
              <Skeleton className="hidden h-4 w-20 lg:block" />
              {Array.from({ length: rows }, (_, row) => (
                <Skeleton key={row} className="h-9 w-28 rounded-md lg:w-full" />
              ))}
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
