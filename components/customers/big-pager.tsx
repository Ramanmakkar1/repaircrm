import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";

/**
 * Easy mode pagination: two big buttons and the words "Page 2 of 5". Both
 * hrefs come from the page, so the URL contract (?page=) is exactly the one
 * the table's pager already uses. With one page there is nothing to turn, so
 * only the summary line shows.
 */
export function BigPager({
  page,
  pageCount,
  previousHref,
  nextHref,
  summary,
}: {
  page: number;
  pageCount: number;
  previousHref: string;
  nextHref: string;
  /** "1–25 of 140 customers" */
  summary: string;
}) {
  return (
    <nav aria-label="Pages" className="flex flex-col items-center gap-3 pt-2">
      <p className="rf-num text-sm font-medium text-muted-foreground">{summary}</p>
      {pageCount > 1 ? (
        <div className="flex w-full max-w-md items-center justify-between gap-3">
          <PagerButton href={previousHref} disabled={page <= 1} label="Previous">
            <ACTIONS.back />
            Previous
          </PagerButton>
          <span className="rf-num shrink-0 text-sm font-semibold text-foreground">
            Page {page} of {pageCount}
          </span>
          <PagerButton href={nextHref} disabled={page >= pageCount} label="Next">
            Next
            <ACTIONS.next />
          </PagerButton>
        </div>
      ) : null}
    </nav>
  );
}

function PagerButton({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = "min-h-12 min-w-28 px-5 text-base";
  if (disabled) {
    return (
      <Button variant="outline" size="lg" className={className} disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  // No scroll={false} on the link: the pager sits under 25 big cards and the app
  // scrolls inside <main>, which stays mounted across the navigation. Letting Next
  // scroll puts the top of the new page back in view; with scroll={false} the next
  // page opened at the bottom.
  return (
    <Button variant="outline" size="lg" className={className} asChild>
      <Link href={href} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}
