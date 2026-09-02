import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

/**
 * The repeated shell for the customer hub's related-record cards: an icon tile
 * + title + a count, an optional "view all" pill, and a compact empty block.
 *
 * The empty block deliberately runs shorter than a full-page `EmptyState`:
 * six of these cards sit in one column, and six 12rem voids would push the
 * ones that DO have rows below the fold.
 */
export function SectionCard({
  icon: Icon,
  title,
  count,
  viewAllHref,
  viewAllLabel = "View all",
  empty,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  viewAllHref?: string;
  viewAllLabel?: string;
  empty: string;
  children?: React.ReactNode;
}) {
  const isEmpty = !children;

  return (
    <Card>
      <CardHeader
        icon={Icon}
        title={title}
        action={
          <>
            {count ? <Chip className="tabular-nums">{count}</Chip> : null}
            {viewAllHref && !isEmpty ? (
              <Link
                href={viewAllHref}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-hover px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {viewAllLabel}
                <ArrowUpRight className="size-3.5" />
              </Link>
            ) : null}
          </>
        }
      />

      <CardContent className="p-0">
        {isEmpty ? (
          <div className="flex flex-col items-center gap-2.5 px-5 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg bg-surface-hover">
              <Icon className="size-[18px] text-faint-foreground" />
            </span>
            <p className="max-w-xs text-[13.5px] leading-snug text-muted-foreground">
              {empty}
            </p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
