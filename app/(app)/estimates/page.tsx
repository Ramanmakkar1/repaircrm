import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/components/ui/cn";
import { BillingFilterBar } from "@/components/billing/filter-bar";
import { formatDate } from "@/components/billing/format";
import { PAGE_SIZE, Pagination } from "@/components/billing/pagination";
import {
  ESTIMATE_STATUS_OPTIONS,
  ESTIMATE_STATUSES,
  EstimateStatusBadge,
} from "@/components/billing/status-badge";

export const metadata = { title: "Estimates · RepairFlow" };

const STATUS_SET = new Set<string>(ESTIMATE_STATUSES);

export default async function EstimatesPage({
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

  const where: Prisma.EstimateWhereInput = { shopId };
  if (status) where.status = status as Prisma.EstimateWhereInput["status"];
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

  const [total, estimates] = await Promise.all([
    db.estimate.count({ where }),
    db.estimate.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, businessName: true },
        },
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      },
    }),
  ]);

  const filtered = Boolean(q || status || customerId);
  const now = requestNow();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estimates"
        description="Draft and send repair estimates for approval."
        actions={
          <Button asChild>
            <Link href="/estimates/new">
              <Plus /> New estimate
            </Link>
          </Button>
        }
      />

      <BillingFilterBar
        basePath="/estimates"
        q={q}
        status={status}
        statusOptions={ESTIMATE_STATUS_OPTIONS}
        placeholder="Search by estimate # or customer…"
      />

      {estimates.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={filtered ? "No estimates match those filters" : "No estimates yet"}
            hint={
              filtered
                ? "Try a different search term or pick another status."
                : "Quote a job before the work starts — approved estimates convert to an invoice in one click."
            }
            action={
              filtered ? (
                <Button variant="outline" asChild>
                  <Link href="/estimates">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/estimates/new">
                    <Plus /> New estimate
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {estimates.map((estimate) => {
              const totals = calcTotals(estimate.lines, estimate.taxRateBps);
              const name =
                estimate.customer.businessName ||
                `${estimate.customer.firstName} ${estimate.customer.lastName}`;
              // An open quote past its expiry needs chasing; once it is
              // approved, declined or converted the date is just history.
              const expired =
                estimate.expiresAt !== null &&
                estimate.expiresAt.getTime() < now &&
                (estimate.status === "DRAFT" || estimate.status === "SENT");

              return (
                <Link
                  key={estimate.id}
                  href={`/estimates/${estimate.id}`}
                  className={cn(
                    "rf-lift flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm hover:shadow-md",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    expired && "border-status-overdue/55",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-2xl font-bold leading-none tabular-nums tracking-tight text-foreground">
                      #{estimate.number}
                    </span>
                    <EstimateStatusBadge status={estimate.status} />
                  </div>

                  <span className="truncate text-[15px] font-bold text-foreground">
                    {name}
                  </span>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Quoted
                    </span>
                    <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                      {formatCents(totals.totalCents)}
                    </span>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <Chip>Written {formatDate(estimate.createdAt)}</Chip>
                    {estimate.expiresAt ? (
                      <Chip
                        className={cn(
                          expired &&
                            "bg-status-overdue-bg font-bold text-status-overdue-fg",
                        )}
                      >
                        {expired ? "Expired " : "Expires "}
                        {formatDate(estimate.expiresAt)}
                      </Chip>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>

          <Pagination
            basePath="/estimates"
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
