import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";

/**
 * The repeated shell for the customer hub's related-record cards: an icon tile
 * + title + a count, an optional "view all" pill, and a quiet empty line
 * instead of a full EmptyState (these cards sit five-to-a-column and shouldn't
 * each claim 12rem of vertical space when empty).
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
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={Icon} size="sm" />
          <CardTitle className="truncate">{title}</CardTitle>
          {count ? (
            <span className="shrink-0 rounded-full bg-surface-hover px-2.5 py-1 text-[12.5px] font-semibold leading-none text-muted-foreground tabular-nums">
              {count}
            </span>
          ) : null}
        </div>

        {viewAllHref && !isEmpty ? (
          <Link
            href={viewAllHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-hover px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground"
          >
            {viewAllLabel}
            <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {isEmpty ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
