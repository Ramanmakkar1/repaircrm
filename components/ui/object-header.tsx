import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

/**
 * The top of every detail screen in the app: a ticket, an invoice, an
 * estimate, a customer, a purchase order.
 *
 * Stripe's object page always opens the same way — the number that matters at
 * the top left in the largest type on the page, the object's state beside it,
 * the actions pinned right, and then a horizontal strip of key/value columns
 * carrying the handful of facts you would otherwise have to hunt for. Only
 * below that does the page become specific.
 *
 * That sameness is the feature. A tech who has opened one detail screen has
 * opened all of them: the balance is always in the same place, the status is
 * always beside it, "back to the list" is always the same link in the same
 * corner. RepairFlow's detail pages each grew their own hero block, so the
 * invoice total, the ticket's device and the PO's vendor all sat somewhere
 * different.
 *
 * `value` is the headline — an invoice total, a ticket's balance, a PO's
 * value. Screens that genuinely have no single number (a customer) pass none,
 * and the title takes the top slot instead.
 */
export interface ObjectMeta {
  label: string;
  /** A node, not a string, so a column can hold a link, a pill or a dash. */
  value: React.ReactNode;
}

export function ObjectHeader({
  back,
  value,
  title,
  subtitle,
  status,
  id,
  meta = [],
  actions,
  className,
}: {
  /** "← Back to tickets". Every detail page has a list it came from. */
  back?: { label: string; href: string };
  /** The headline figure. Rendered in the largest type on the page. */
  value?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A `StatusPill`. Sits beside the headline, never below it. */
  status?: React.ReactNode;
  /** A `CopyableId`, or anything else that identifies the record. */
  id?: React.ReactNode;
  /**
   * The metadata strip: 4–6 short facts as columns. More than six and they
   * stop being scannable — put the rest in the body of the page.
   */
  meta?: ObjectMeta[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ArrowLeft aria-hidden className="size-3.5 shrink-0" />
          {back.label}
        </Link>
      ) : null}

      <div className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {value !== undefined ? (
                <span className="rf-num text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                  {value}
                </span>
              ) : null}
              {status}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p
                className={cn(
                  "min-w-0 truncate text-foreground",
                  // when there is no headline figure the title IS the headline
                  value === undefined
                    ? "text-[20px] font-semibold leading-tight tracking-[-0.01em]"
                    : "text-[13.5px] font-medium",
                )}
              >
                {title}
              </p>
              {subtitle ? (
                <p className="min-w-0 truncate text-[13px] text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
              {id ? <div className="pt-0.5">{id}</div> : null}
            </div>
          </div>

          {/*
            `min-w-0`, NOT `shrink-0`.

            shrink-0 stopped this slot from ever giving ground, so a header
            with six or seven actions contributed its full min-content width to
            the flex row and pushed the entire page into a horizontal scroll on
            a phone. The detail pages had each grown a `max-w-[calc(100vw-…)]`
            wrapper to clamp it back — three copies of a workaround for one
            line in here. Letting the slot shrink lets its own flex-wrap do the
            job it was always supposed to do.
          */}
          {actions ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}
        </div>

        {/*
          The metadata strip. Columns, not a stacked definition list — a
          stacked list is taller than the facts deserve and makes you read
          downward for something you should be able to take in sideways.

          Flex-wrap, NOT the gap-px-over-border-fill grid the dashboard band
          uses. That trick only works when the cell count divides evenly into
          the column count: five facts in a six-column grid leave a sixth cell
          empty, and an empty cell there is not blank — the fill shows through
          as a grey rectangle at the end of the row that reads as a rendering
          bug. It reappears at every breakpoint the count doesn't divide into.
          Flexing the cells means the last row always fills itself, at any
          count and any width, and the hairlines ride on the cells.
        */}
        {meta.length > 0 ? (
          <div className="flex flex-wrap overflow-hidden rounded-b-lg border-t border-border">
            {meta.map((item) => (
              <div
                key={item.label}
                // basis sets the wrap threshold; min-w-0 is what lets the value truncate
                className={cn(
                  "flex flex-1 basis-[150px] flex-col gap-1 border-l border-border px-4 py-2.5",
                  "min-w-0 first:border-l-0",
                )}
              >
                <p className="truncate text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint-foreground">
                  {item.label}
                </p>
                <div className="min-w-0 truncate text-[13.5px] text-foreground">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
