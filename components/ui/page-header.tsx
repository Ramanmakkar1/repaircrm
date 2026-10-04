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
 * THE PAGE HEADER RULE (docs/touch-style-guide.md, "Page headers"):
 *
 *   - One title size: 22px on a phone, 24px from `sm`. Use `PageHeader`, or
 *     `PAGE_TITLE_CLASS` on a detail page's own h1.
 *   - One way back: the shell's Back button (it returns to where the person
 *     came from, filters and all). Do not add text back links or back chips.
 *   - In Easy mode the breadcrumb trail is hidden (globals.css,
 *     `[data-breadcrumbs]`): it repeated Back and the title in 13px links.
 *     Full mode keeps it for the back office.
 *   - The title sits at the top of the page content, nothing above it, so it
 *     never jumps between screens.
 */
export const PAGE_TITLE_CLASS =
  "text-balance text-[22px] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-[24px]";

/**
 * The trail above a page title: where this record sits, and one click back to
 * every level of it. Small and muted on purpose — it orients, it doesn't
 * compete with the title. Full mode only by default (see the rule above).
 *
 * Exported on its own as well as through `PageHeader`, because several detail
 * pages build their own hero block and only need the trail.
 */
export function Breadcrumbs({
  items,
  className,
  keepInEasyMode = false,
}: {
  items: Crumb[];
  className?: string;
  /** Show the trail in Easy mode too. Almost never right: the shell's Back already goes there. */
  keepInEasyMode?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" data-breadcrumbs={keepInEasyMode ? "keep" : "full-only"} className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-none">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="-my-2 truncate py-2 font-semibold text-muted-foreground transition-colors hover:text-foreground"
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
          <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
          {description ? (
            <p className="max-w-[65ch] text-[14px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        // Wraps instead of pushing the page sideways: on a tablet a header with
        // four buttons ran 40px past the screen edge.
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
