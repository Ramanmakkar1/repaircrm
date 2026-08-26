import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export const PAGE_SIZE = 25;

/**
 * Prev/next pager for the billing lists. Server-rendered links (not buttons) so
 * a page is a real, shareable URL and the browser's back button behaves.
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

  const linkClass = cn(buttonVariants({ variant: "outline", size: "sm" }));
  const disabledClass = cn(linkClass, "pointer-events-none opacity-50");

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
      <p className="text-xs text-muted-foreground tabular-nums">
        {total === 0
          ? "No results"
          : `${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-1.5">
        <Link
          href={href(page - 1)}
          className={page <= 1 ? disabledClass : linkClass}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
        >
          <ChevronLeft /> Prev
        </Link>
        <span className="px-1 text-xs text-muted-foreground tabular-nums">
          {page} / {pageCount}
        </span>
        <Link
          href={href(page + 1)}
          className={page >= pageCount ? disabledClass : linkClass}
          aria-disabled={page >= pageCount}
          tabIndex={page >= pageCount ? -1 : undefined}
        >
          Next <ChevronRight />
        </Link>
      </div>
    </div>
  );
}
