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
 * The title block every screen opens with, in grey. Sized to match
 * `PageHeader`'s 26px title and 15px description so the real header lands in
 * the same place the skeleton was — the page fills in rather than jumping.
 */
export function PageHeaderSkeleton({
  filters = 0,
  icon = true,
}: {
  filters?: number;
  /**
   * Matches `PageHeader`'s 44px icon tile, which only exists from `sm` up —
   * without it the title slides left when the real header lands. Pass `false`
   * for the handful of screens whose header carries no icon.
   */
  icon?: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-3.5 pb-1">
        {icon ? (
          <Skeleton className="hidden size-11 shrink-0 rounded-lg sm:block" />
        ) : null}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>
      </div>
      {filters > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: filters }, (_, index) => (
            <Skeleton key={index} className="h-10 w-28 rounded-full" />
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
