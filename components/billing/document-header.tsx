import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * The top of an invoice or estimate in Easy mode.
 *
 *   <- Invoices
 *   +------------------------------------------------------------+
 *   | Invoice #1014  (Sent)                           $450.00    |
 *   | Okonkwo Dental Group >                    Balance due      |
 *   |                                                            |
 *   | [ Take payment ]  [ Send again v ]  [ More ]               |
 *   |------------------------------------------------------------|
 *   | TOTAL      COLLECTED    ISSUED      DUE         TICKET     |
 *   +------------------------------------------------------------+
 *
 * One big black button (what to do next, chosen by status in
 * `primary-action.ts`), then at most one outline beside it and a labelled
 * "More" for everything else. The facts under it are plain label/value pairs,
 * not boxes inside a box. Full mode keeps the dense `ObjectHeader`.
 *
 * Layout only: the page decides which actions exist and which is the primary,
 * so no permission, total or payment rule is decided here.
 */

export interface DocumentFact {
  label: string;
  /** A node, so a fact can hold a link, a date in the alert colour or a dash. */
  value: React.ReactNode;
}

export function DocumentHeader({
  back,
  title,
  status,
  customer,
  amount,
  facts = [],
  actions,
  className,
}: {
  back: { label: string; href: string };
  /** "Invoice #1014". */
  title: React.ReactNode;
  /** A status badge. Sits beside the title, never only a colour. */
  status?: React.ReactNode;
  /** Who the document is for; the name is a link to them. */
  customer?: { name: string; href: string };
  /** The headline figure on the right, with one plain-words line under it. */
  amount?: { value: React.ReactNode; hint?: string; className?: string };
  /** Four to six short facts. */
  facts?: DocumentFact[];
  /** The action row: primary, one secondary, More. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Link
        href={back.href}
        data-touch-control
        className="inline-flex min-h-12 w-fit items-center gap-2 rounded-lg pr-3 text-base font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden className="size-5 shrink-0" />
        {back.label}
      </Link>

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="min-w-0 break-words text-[26px] font-semibold leading-tight tracking-tight text-foreground sm:text-[30px]">
                  {title}
                </h1>
                {status}
              </div>
              {customer ? (
                <Link
                  href={customer.href}
                  data-touch-control
                  className="inline-flex w-fit max-w-full items-center gap-1 rounded-lg text-lg font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 break-words">{customer.name}</span>
                  <ChevronRight aria-hidden className="size-5 shrink-0" />
                </Link>
              ) : null}
            </div>

            {amount ? (
              <div className="flex flex-col sm:items-end sm:text-right">
                <p className={cn("rf-num text-[34px] font-semibold leading-none tracking-tight tabular-nums", amount.className)}>
                  {amount.value}
                </p>
                {amount.hint ? <p className="mt-1.5 text-sm text-muted-foreground">{amount.hint}</p> : null}
              </div>
            ) : null}
          </div>

          {actions ? <div className="flex flex-wrap items-start gap-3">{actions}</div> : null}
        </div>

        {facts.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-[12px] font-medium uppercase tracking-[0.04em] text-faint-foreground">{fact.label}</dt>
                <dd className="min-w-0 break-words text-base font-medium text-foreground">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Sizes a trigger button the page does not own (the take-payment dialog owns its
 * own button and only takes a `size`) to the header's 48px scale. `primary`
 * leaves it the app's black; `secondary` turns it into an outline so a second
 * black button never competes. A phone gives the primary the full row.
 *
 * Selector based on purpose: the dialog's trigger cannot take a class, and
 * the checkout dialogs are not to be edited from here.
 */
const BUTTON = "[&_[data-slot=button]]:h-12 [&_[data-slot=button]]:text-base";
const PRIMARY_SLOT = cn(BUTTON, "[&_[data-slot=button]]:px-6 max-sm:w-full max-sm:[&_[data-slot=button]]:w-full");
const SECONDARY_SLOT = cn(
  BUTTON,
  "[&_[data-slot=button]]:px-5",
  "[&_[data-slot=button]]:border [&_[data-slot=button]]:border-border-strong",
  "[&_[data-slot=button]]:bg-surface [&_[data-slot=button]]:text-foreground",
  "[&_[data-slot=button]:hover]:bg-surface-hover",
);

export function ActionSlot({ tone, children }: { tone: "primary" | "secondary"; children: React.ReactNode }) {
  return <div className={tone === "primary" ? PRIMARY_SLOT : SECONDARY_SLOT}>{children}</div>;
}
