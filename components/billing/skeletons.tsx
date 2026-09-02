import * as React from "react";

import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * The grey shapes the money screens open with.
 *
 * Every billing route has one of four silhouettes — a filtered card list, a
 * document detail, a document form, a drawer-history grid — so they live here
 * once rather than being redrawn in fourteen `loading.tsx` files that would
 * drift apart the first time a header changed. Each one is measured against the
 * real page: same icon tile, same title and description heights, same column
 * split, so the content lands where the grey was instead of shunting the page.
 */

/**
 * `PageHeader`'s icon tile, title and description — from the shared helper —
 * plus the header's own action buttons, which the shared one has no opinion
 * about and which are a third of the header's width on these screens.
 */
function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-center sm:justify-between">
      <PageHeaderSkeleton />
      {actions > 0 ? (
        <div className="flex shrink-0 items-center gap-2.5">
          {Array.from({ length: actions }, (_, index) => (
            <Skeleton key={index} className="h-10 w-32 rounded-md" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A filtered card list: estimates, invoices, recurring schedules.
 *
 * `filters` is the number of status pills the real bar shows, so the row is the
 * width it is about to be rather than a generic strip.
 */
export function BillingListSkeleton({
  filters = 0,
  actions = 1,
  cards = 6,
}: {
  filters?: number;
  actions?: number;
  cards?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton actions={actions} />

      {filters > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: filters }, (_, index) => (
              <Skeleton key={index} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-full max-w-sm rounded-md" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-[230px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * A document detail: breadcrumb trail, the header card carrying the status and
 * every action, then the two-column body with the aside on the right.
 */
export function DocumentDetailSkeleton({ aside = true }: { aside?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-[210px] rounded-lg" />

      <div className={aside ? "grid gap-5 lg:grid-cols-3" : "flex flex-col gap-5"}>
        <div className={aside ? "flex flex-col gap-5 lg:col-span-2" : "flex flex-col gap-5"}>
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-52 rounded-lg" />
        </div>
        {aside ? (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-56 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A document form: the header, then the single tall card that holds the
 * customer row, the line-item editor and the totals footer.
 */
export function DocumentFormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton actions={0} />
      <Skeleton className="h-[540px] rounded-lg" />
    </div>
  );
}
