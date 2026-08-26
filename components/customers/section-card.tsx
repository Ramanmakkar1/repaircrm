import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The repeated shell for the customer hub's related-record cards: icon + title
 * + a count, an optional "view all" link, and a quiet empty line instead of a
 * full EmptyState (these cards sit five-to-a-column and shouldn't each claim
 * 12rem of vertical space when empty).
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
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground" />
          {title}
          {count ? (
            <span className="text-xs font-normal text-muted-foreground">{count}</span>
          ) : null}
        </CardTitle>
        {viewAllHref && !isEmpty ? (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-accent"
          >
            {viewAllLabel}
            <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {isEmpty ? (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
