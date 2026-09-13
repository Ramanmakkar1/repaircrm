import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

export interface Crumb {
  label: string;
  /** Omit on the last crumb — the page you are already on isn't a link. */
  href?: string;
}

/**
 * The trail above a page title: where this record sits, and one click back to
 * every level of it. Small and muted on purpose — it orients, it doesn't
 * compete with the title.
 *
 * Exported on its own as well as through `PageHeader`, because several detail
 * pages build their own hero block and only need the trail.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-none">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="truncate font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "truncate font-semibold",
                    isLast ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {crumb.label}
                </span>
              )}
              {isLast ? null : (
                <ChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-faint-foreground"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optional trail rendered above the title. Existing callers pass nothing. */
  breadcrumbs?: Crumb[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-1 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-center">
        <div className="flex min-w-0 flex-col gap-1">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumbs items={breadcrumbs} className="mb-0.5" />
          ) : null}
          <h1 className="text-balance text-[22px] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-[24px]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-[65ch] text-[14px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
