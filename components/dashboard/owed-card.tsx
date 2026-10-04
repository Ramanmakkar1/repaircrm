import Link from "next/link";
import { CircleCheck, Clock, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";
import type { OwedSection } from "@/lib/dashboard/overview";
import { Panel } from "./panel";

/**
 * "Owed to you": what customers still owe, who owes the most (each with a Call
 * button) and one big button to collect it. The balance of each invoice is the
 * one the invoices list shows (payments in, refunds paid back out), so the total
 * here is the sum of the "due" amounts on /invoices?status=unpaid.
 */
export function OwedCard({ owed, className }: { owed: OwedSection; className?: string }) {
  const nothingOwed = owed.count === 0;
  return (
    <Panel aria-labelledby="owed-title" className={cn("flex flex-col gap-2 p-4 sm:p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="owed-title" className="text-lg font-semibold leading-tight">
          Owed to you
        </h2>
        {owed.overdueCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-status-overdue-bg px-2 py-1 text-sm font-semibold leading-none text-status-overdue-fg">
            <Clock className="size-3.5" aria-hidden />
            {owed.overdueCount} {owed.overdueCount === 1 ? "invoice" : "invoices"} overdue
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="rf-num text-4xl font-semibold leading-none tracking-tight" data-testid="owed-amount">
            {formatCents(owed.totalCents)}
            {owed.truncated ? "+" : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{nothingOwed ? "No unpaid invoices" : `${owed.count} unpaid ${owed.count === 1 ? "invoice" : "invoices"}`}</p>
        </div>
        {/* The big black button only when there is something to collect: with nothing owed it would be a loud button that leads to an empty list. */}
        {nothingOwed ? null : (
          <Button asChild className="h-12 min-w-40 flex-1 text-base sm:flex-none">
            <Link href="/invoices?status=unpaid">Collect payments</Link>
          </Button>
        )}
      </div>

      {nothingOwed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-hover px-3 py-3">
          <p className="flex items-center gap-2 text-[15px] font-medium text-muted-foreground">
            <CircleCheck className="size-5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold text-foreground">Nothing owed.</span> Nobody owes you anything right now.
            </span>
          </p>
          <Link
            href="/invoices"
            data-touch-control
            className="inline-flex min-h-12 items-center rounded-lg px-1 text-[15px] font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            All invoices <span aria-hidden className="ml-1">→</span>
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border" aria-label="Customers who owe the most">
          {owed.customers.map((customer) => (
            <li key={customer.customerId} className="flex items-center gap-2 py-px">
              <Link
                href={`/customers/${customer.customerId}`}
                data-touch-control
                className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate text-[15px] font-semibold">{customer.name}</span>
                <span className="rf-num truncate text-sm text-muted-foreground">
                  {formatCents(customer.cents)} owed{customer.invoices > 1 ? ` · ${customer.invoices} invoices` : ""}
                </span>
              </Link>
              {customer.callHref ? (
                <Button asChild variant="outline" className="h-12 min-w-24 shrink-0 text-[15px]">
                  <a href={customer.callHref} aria-label={`Call ${customer.name}`}>
                    <Phone aria-hidden />
                    Call
                  </a>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
