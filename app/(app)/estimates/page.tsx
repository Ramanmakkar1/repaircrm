import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
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
  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
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

      <Card>
        <CardContent className="px-0 py-0">
          {estimates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={filtered ? "No estimates match those filters" : "No estimates yet"}
              hint={
                filtered
                  ? "Try a different search term or clear the status filter."
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
          ) : (
            <>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-[80px]">#</Th>
                    <Th>Customer</Th>
                    <Th className="w-[110px]">Date</Th>
                    <Th className="w-[110px]">Expires</Th>
                    <Th className="w-[120px]">Status</Th>
                    <Th className="w-[110px] text-right">Total</Th>
                  </Tr>
                </THead>
                <TBody>
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
                      <Tr key={estimate.id}>
                        <Td>
                          <Link
                            href={`/estimates/${estimate.id}`}
                            className="font-medium tabular-nums text-accent hover:underline"
                          >
                            #{estimate.number}
                          </Link>
                        </Td>
                        <Td className="max-w-[280px] truncate">
                          <Link
                            href={`/customers/${estimate.customer.id}`}
                            className="hover:underline"
                          >
                            {name}
                          </Link>
                        </Td>
                        <Td className="text-muted-foreground tabular-nums">
                          {formatDate(estimate.createdAt)}
                        </Td>
                        <Td
                          className={cn(
                            "tabular-nums",
                            expired
                              ? "font-medium text-status-overdue"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatDate(estimate.expiresAt)}
                        </Td>
                        <Td>
                          <EstimateStatusBadge status={estimate.status} />
                        </Td>
                        <Td className="text-right tabular-nums">
                          {formatCents(totals.totalCents)}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>

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
        </CardContent>
      </Card>
    </div>
  );
}
