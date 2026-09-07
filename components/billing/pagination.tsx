import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";

export const PAGE_SIZE = 25;

/**
 * The footer band under a billing list table: how many rows you are looking
 * at, and one step either way.
 *
 * It lives INSIDE the table's card, hanging off a hairline, rather than
 * floating below it as a second block — a pager that belongs to a table should
 * be attached to it. Server-rendered links (not buttons) so a page is a real,
 * shareable URL and the browser's back button behaves.
 */
export function Pagination({
  basePath,
  page,
  total,
  params,
}: {
  basePath: string;
  /** 1-based. */
  page: number;
  total: number;
  /** Filters to carry across pages. */
  params: Record<string, string | undefined>;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
      <p className="rf-num text-[12.5px] font-medium text-muted-foreground">
        {total === 0 ? "No results" : `${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-1.5">
        <Button asChild={page > 1} size="sm" variant="outline" disabled={page <= 1}>
          {page > 1 ? (
            <Link href={href(page - 1)} scroll={false}>
              <ACTIONS.back />
              Previous
            </Link>
          ) : (
            <span>
              <ACTIONS.back />
              Previous
            </span>
          )}
        </Button>
        <span className="rf-num px-1 text-[12.5px] font-medium text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          asChild={page < pageCount}
          size="sm"
          variant="outline"
          disabled={page >= pageCount}
        >
          {page < pageCount ? (
            <Link href={href(page + 1)} scroll={false}>
              Next
              <ACTIONS.next />
            </Link>
          ) : (
            <span>
              Next
              <ACTIONS.next />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
