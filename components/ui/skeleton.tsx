import * as React from "react";
import { cn } from "./cn";

/**
 * A cool-gray sweep rather than a pulse — on a pure-white page a fading block
 * reads as a rendering glitch, a travelling highlight reads as loading.
 * `.rf-skeleton` (globals.css) carries the gradient and respects
 * prefers-reduced-motion by falling back to a flat gray.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rf-skeleton rounded-sm bg-surface-hover", className)}
      {...props}
    />
  );
}

/**
 * The title block every screen opens with, in grey. Measured against
 * `PageHeader` (22px title on a phone, 24px from `sm`, a 14px description
 * under it, 4px apart) so the real header lands exactly where the grey was:
 * the page fills in instead of jumping.
 */
export function PageHeaderSkeleton({
  filters = 0,
  icon = false,
}: {
  filters?: number;
  /**
   * A 44px tile left of the title. `PageHeader` no longer draws one, so it is
   * off by default (it used to be on, and every title landed 58px left of its
   * placeholder). Only pass `true` for a header that really has an icon tile.
   */
  icon?: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-3.5 pb-1">
        {icon ? (
          <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <Skeleton className="h-[25px] w-44 sm:h-[27px] sm:w-56" />
          <Skeleton className="h-[22px] w-72 max-w-full" />
        </div>
      </div>
      {filters > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: filters }, (_, index) => (
            <Skeleton key={index} className="h-12 w-28 rounded-full" />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * `ObjectHeader`'s silhouette: the short "back to the list" link over the card
 * that holds the headline figure, the status, the actions and the metadata
 * strip.
 *
 * Detail routes measure their skeleton against the header they actually draw,
 * and getting it wrong is worse than having none — a skeleton of the wrong
 * height shunts the whole page down the moment the content lands, which is the
 * one thing it exists to avoid. So the two heights live here once rather than
 * being re-guessed in every `loading.tsx`.
 */
export function ObjectHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-[176px] rounded-lg" />
    </div>
  );
}

/** The card grid the list screens use, at the same 3-up rhythm. */
export function CardGridSkeleton({
  count = 6,
  height = "h-[196px]",
}: {
  count?: number;
  height?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn("rounded-lg", height)} />
      ))}
    </div>
  );
}

/** A stack of rows, for the screens that show a table rather than cards. */
export function RowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-14 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * A page of `RecordCard`s in grey: the round picture, a title, a line, and
 * the same 1 / 2 / 3 column grid as `RecordGrid`. For list screens in Easy mode.
 */
export function RecordCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-surface p-4">
          <Skeleton className="size-20 shrink-0 rounded-xl sm:size-24" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A hub of `PictureTile`s in grey: the 4:3 picture and two lines under it, in
 * the hub grid (2 / 3 / 4 across). For Home and the hub screens.
 */
export function PictureTileGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-44 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
