import Link from "next/link";
import { Plus, Receipt, RefreshCcw } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/components/ui/cn";
import { BillingFilterBar } from "@/components/billing/filter-bar";
import { formatDate, isOverdue } from "@/components/billing/format";
import { PAGE_SIZE, Pagination } from "@/components/billing/pagination";
import {
  INVOICE_STATUS_OPTIONS,
  INVOICE_STATUSES,
  InvoiceStatusBadge,
} from "@/components/billing/status-badge";

export const metadata = { title: "Invoices · RepairFlow" };

const STATUS_SET = new Set<string>(INVOICE_STATUSES);

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusParam = typeof params.status === "string" ? params.status : "";
  const status = STATUS_SET.has(statusParam) ? statusParam : "";
  const customerId = typeof params.customerId === "string" ? params.customerId : "";
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);

  // Tenant boundary first, then the user's filters on top of it.
  const where: Prisma.InvoiceWhereInput = { shopId };
  if (status) where.status = status as Prisma.InvoiceWhereInput["status"];
  if (customerId) where.customerId = customerId;

  if (q) {
    const asNumber = Number.parseInt(q.replace(/^#/, ""), 10);
    where.OR = [
      ...(Number.isFinite(asNumber) ? [{ number: asNumber }] : []),
      { customer: { firstName: { contains: q, mode: "insensitive" as const } } },
      { customer: { lastName: { contains: q, mode: "insensitive" as const } } },
      { customer: { businessName: { contains: q, mode: "insensitive" as const } } },
    ];
  }

  const [total, invoices] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, businessName: true },
        },
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        payments: { select: { amountCents: true } },
      },
    }),
  ]);

  const filtered = Boolean(q || status || customerId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        description="Bill customers and track payment status."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/invoices/recurring">
                <RefreshCcw /> Recurring
              </Link>
            </Button>
            <Button asChild>
              <Link href="/invoices/new">
                <Plus /> New invoice
              </Link>
            </Button>
          </div>
        }
      />

      <BillingFilterBar
        basePath="/invoices"
        q={q}
        status={status}
        statusOptions={INVOICE_STATUS_OPTIONS}
        placeholder="Search by invoice # or customer…"
      />

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={filtered ? "No invoices match those filters" : "No invoices yet"}
            hint={
              filtered
                ? "Try a different search term or pick another status."
                : "Raise one from a ticket, or start from scratch."
            }
            action={
              filtered ? (
                <Button variant="outline" asChild>
                  <Link href="/invoices">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/invoices/new">
                    <Plus /> New invoice
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {invoices.map((invoice) => {
              const totals = invoiceTotals(
                invoice.lines,
                invoice.taxRateBps,
                invoice.payments,
              );
              const voided = invoice.status === "VOID";
              const overdue = isOverdue(invoice.dueDate, totals.balanceCents);
              const name =
                invoice.customer.businessName ||
                `${invoice.customer.firstName} ${invoice.customer.lastName}`;
              const settled = !voided && totals.balanceCents <= 0;

              return (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className={cn(
                    "rf-lift flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm hover:shadow-md",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    overdue && "border-status-overdue/55",
                    voided && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "text-2xl font-bold leading-none tabular-nums tracking-tight text-foreground",
                        voided && "text-faint-foreground line-through",
                      )}
                    >
                      #{invoice.number}
                    </span>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>

                  <span
                    className={cn(
                      "truncate text-[15px] font-bold text-foreground",
                      voided && "text-faint-foreground",
                    )}
                  >
                    {name}
                  </span>

                  <div className="flex items-end justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Total
                      </span>
                      <span
                        className={cn(
                          "text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground",
                          voided && "text-faint-foreground line-through",
                        )}
                      >
                        {formatCents(totals.totalCents)}
                      </span>
                    </div>
                    {!voided ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Balance
                        </span>
                        <span
                          className={cn(
                            "text-lg font-bold leading-none tabular-nums",
                            settled ? "text-status-resolved-fg" : "text-foreground",
                          )}
                        >
                          {settled ? "Paid" : formatCents(totals.balanceCents)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <Chip>Raised {formatDate(invoice.createdAt)}</Chip>
                    {invoice.dueDate ? (
                      <Chip
                        className={cn(
                          overdue &&
                            "bg-status-overdue-bg font-bold text-status-overdue-fg",
                        )}
                      >
                        {overdue ? "Overdue " : "Due "}
                        {formatDate(invoice.dueDate)}
                      </Chip>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>

          <Pagination
            basePath="/invoices"
            page={page}
            total={total}
            params={{
              q: q || undefined,
              status: status || undefined,
              customerId: customerId || undefined,
            }}
          />
        </>
      )}

    </div>
  );
}
