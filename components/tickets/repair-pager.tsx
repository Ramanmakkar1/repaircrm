import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Two big buttons and where you are: "Previous   Page 2 of 5   Next".
 *
 * Both links keep every filter (the page builds the hrefs). A button that has
 * nowhere to go stays on screen but disabled, so the pair never jumps around
 * under a thumb. With one page there is nothing to turn, so only the count shows.
 */
export function RepairPager({
  page,
  pageCount,
  from,
  to,
  total,
  noun = "repair",
  previousHref,
  nextHref,
}: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  noun?: string;
  previousHref: string;
  nextHref: string;
}) {
  if (pageCount <= 1) {
    return (
      <p className="rf-num text-center text-sm text-muted-foreground">
        {total} {noun}
        {total === 1 ? "" : "s"}
      </p>
    );
  }

  const hasPrevious = page > 1;
  const hasNext = page < pageCount;
  const big = "h-12 min-w-28 flex-1 text-base sm:flex-none sm:min-w-36";

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      {hasPrevious ? (
        <Button asChild variant="outline" size="lg" className={big}>
          <Link href={previousHref} rel="prev">
            <ArrowLeft aria-hidden />
            Previous
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="lg" className={big} disabled>
          <ArrowLeft aria-hidden />
          Previous
        </Button>
      )}

      <p className="flex flex-col items-center text-center">
        <span className="rf-num whitespace-nowrap text-base font-semibold">
          Page {page} of {pageCount}
        </span>
        <span className="rf-num hidden text-sm text-muted-foreground sm:block">
          {from}–{to} of {total}
        </span>
      </p>

      {hasNext ? (
        <Button asChild variant="outline" size="lg" className={big}>
          <Link href={nextHref} rel="next">
            Next
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="lg" className={big} disabled>
          Next
          <ArrowRight aria-hidden />
        </Button>
      )}
    </nav>
  );
}
