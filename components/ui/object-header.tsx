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

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>

        {/*
          The metadata strip. Columns, not a stacked definition list — a
          stacked list is taller than the facts deserve and makes you read
          downward for something you should be able to take in sideways.
          The hairline grid is the same gap-px-over-border-fill trick the
          dashboard's status strip uses, so the two read as one idea.
        */}
        {meta.length > 0 ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg border-t border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {meta.map((item) => (
              <div
                key={item.label}
                className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-2.5"
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
