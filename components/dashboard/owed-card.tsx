import Link from "next/link";
import { CircleCheck, Clock, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";
import type { OwedSection } from "@/lib/dashboard/overview";
import { Panel } from "./panel";

/**
 * "Owed to you": what customers still owe, who owes the most, and one big
 * button to collect it. The balance of each invoice is the one the invoices
 * list shows (payments in, refunds paid back out), so the total here is the sum
 * of the "due" amounts on /invoices?status=unpaid.
 */
export function OwedCard({ owed, className }: { owed: OwedSection; className?: string }) {
  const nothingOwed = owed.count === 0;
  return (
    <Panel aria-labelledby="owed-title" className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="owed-title" className="text-lg font-semibold">
            Owed to you
          </h2>
          <p className="rf-num mt-1 text-4xl font-semibold leading-none tracking-tight" data-testid="owed-amount">
            {formatCents(owed.totalCents)}
            {owed.truncated ? "+" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right text-sm">
          <span className="font-medium text-muted-foreground">{nothingOwed ? "No unpaid invoices" : `${owed.count} unpaid ${owed.count === 1 ? "invoice" : "invoices"}`}</span>
          {owed.overdueCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-status-overdue-bg px-2 py-1 font-semibold text-status-overdue-fg">
              <Clock className="size-3.5" aria-hidden />
              {owed.overdueCount} overdue
            </span>
          ) : null}
        </div>
      </div>

      {nothingOwed ? (
        <p className="flex flex-1 items-center gap-2 rounded-xl bg-surface-hover px-3 py-4 text-[15px] font-medium text-muted-foreground">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          Nobody owes you anything right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Customers who owe the most">
          {owed.customers.map((customer) => (
            <li key={customer.customerId} className="flex items-center gap-2 rounded-xl border border-border pl-3 pr-1 py-1">
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

      <Button asChild className="mt-auto h-12 w-full text-base">
        <Link href="/invoices?status=unpaid">Collect payments</Link>
      </Button>
    </Panel>
  );
}
