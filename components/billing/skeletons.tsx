import * as React from "react";

import {
  ObjectHeaderSkeleton,
  PageHeaderSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

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
            <Skeleton key={index} className="h-12 w-32 rounded-md" />
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
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: filters }, (_, index) => (
              <Skeleton key={index} className="h-11 w-24 shrink-0 rounded-xl" />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-12 min-w-0 flex-1 rounded-xl sm:max-w-xl" />
            <Skeleton className="h-12 w-28 rounded-xl" />
          </div>
        </div>
      ) : null}

      {/* The Easy-mode record cards: one column on a phone, two on a tablet. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * A document detail: the header carrying the status and every action, then the
 * two-column body with the aside on the right.
 *
 * `header` picks which of the two silhouettes the route above actually draws.
 * `object` is the `ObjectHeader` shape — a short "back to the list" link over a
 * card that is the headline figure plus one row of metadata columns. `card` is
 * the older breadcrumb-over-hero-card shape the screens still on it use. They
 * are different heights, and a skeleton that is the wrong height shunts the
 * page the moment the content lands, which is the one thing it exists to avoid.
 */
export function DocumentDetailSkeleton({
  aside = true,
  header = "card",
}: {
  aside?: boolean;
  header?: "card" | "object";
}) {
  return (
    <div className="flex flex-col gap-5">
      {header === "object" ? (
        <ObjectHeaderSkeleton />
      ) : (
        <>
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-[210px] rounded-lg" />
        </>
      )}

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
 * The POS-style bill screen in Easy mode: the way back, then the bill on the
 * left (four tabs and a few line rows) and the tall summary card on the right.
 * On a phone the summary comes first, exactly as the real page orders them, so
 * the content lands where the grey was.
 */
export function BillDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Skeleton className="h-12 w-32 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-24 shrink-0 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-7 w-24" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[5.5rem] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="ml-auto h-52 w-full max-w-md rounded-2xl" />
        </div>
        <Skeleton className="order-1 h-[34rem] rounded-2xl lg:order-2" />
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
