import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips, FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { customerLabel } from "@/components/customers/format";
import { RowLink } from "@/components/list/row-link";
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

  const [total, estimates, filteredCustomer] = await Promise.all([
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
    // Only to name the chip — the customer filter arrives by URL and used to be
    // completely invisible once you got here.
    customerId
      ? db.customer.findFirst({
          where: { id: customerId, shopId },
          select: { firstName: true, lastName: true, businessName: true },
        })
      : null,
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
              <ACTIONS.add /> New estimate
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterTabs
          aria-label="Estimate views"
          tabs={[{ value: "", label: "All" }, ...ESTIMATE_STATUS_OPTIONS].map(
            (view) => ({
              label: view.label,
              href: hrefFor(view.value, q, customerId),
              active: status === view.value,
            }),
          )}
        />

        <BillingFilterBar
          basePath="/estimates"
          q={q}
          status={status}
          customerId={customerId}
          placeholder="Search by estimate # or customer…"
        />

        {filteredCustomer ? (
          <FilterChips
            label="Customer"
            options={[
              { label: "All", href: hrefFor(status, q, "") },
              {
                label: customerLabel(filteredCustomer),
                href: hrefFor(status, q, customerId),
                active: true,
              },
            ]}
          />
        ) : null}
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          {estimates.length === 0 ? (
            <EmptyState
              icon={ICONS.estimate}
              title={filtered ? "No estimates match those filters" : "No estimates yet"}
              hint={
                filtered
                  ? "Try a different search term, or pick another view."
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
                      <ACTIONS.add /> New estimate
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
                    <Th>Estimate</Th>
                    <Th>Customer</Th>
                    <Th>Status</Th>
                    <Th>Written</Th>
                    <Th>Expires</Th>
                    <Th className="text-right">Quoted</Th>
                  </Tr>
                </THead>
                <TBody>
                  {estimates.map((estimate) => {
                    const totals = calcTotals(estimate.lines, estimate.taxRateBps);
                    // An open quote past its expiry needs chasing; once it is
                    // approved, declined or converted the date is just history.
                    const expired =
                      estimate.expiresAt !== null &&
                      estimate.expiresAt.getTime() < now &&
                      (estimate.status === "DRAFT" || estimate.status === "SENT");

                    return (
                      <RowLink key={estimate.id} href={`/estimates/${estimate.id}`}>
                        <Td>
                          <Link
                            href={`/estimates/${estimate.id}`}
                            className="rf-id font-semibold text-accent-soft-foreground hover:underline"
                          >
                            #{estimate.number}
                          </Link>
                        </Td>
                        {/*
                          Plain text, not a link to the customer. The whole row
                          already navigates to the document; a second link
                          inside it sends some clicks somewhere else entirely,
                          which is a misclick trap and a nested-interactive
                          a11y problem besides. The customer is one click away
                          on the document itself.
                        */}
                        <Td>
                          <span className="block max-w-[180px] truncate font-medium text-foreground">
                            {customerLabel(estimate.customer)}
                          </span>
                        </Td>
                        <Td>
                          <EstimateStatusBadge status={estimate.status} size="md" />
                        </Td>
                        <Td className="text-muted-foreground">
                          {formatDate(estimate.createdAt)}
                        </Td>
                        {/* Red on the date is what the card's left stripe used to
                            say, spent on the cell that actually explains it. */}
                        <Td
                          className={cn(
                            "text-muted-foreground",
                            expired && "font-semibold text-status-overdue-fg",
                          )}
                        >
                          {estimate.expiresAt ? formatDate(estimate.expiresAt) : "—"}
                        </Td>
                        <Td className="text-right font-semibold text-foreground">
                          {formatCents(totals.totalCents)}
                        </Td>
                      </RowLink>
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

// ---------------------------------------------------------------------------

/** A view is a URL: shareable, bookmarkable, and back-button correct. */
function hrefFor(status: string, q: string, customerId: string): string {
  const search = new URLSearchParams();
  if (status) search.set("status", status);
  if (q) search.set("q", q);
  if (customerId) search.set("customerId", customerId);
  const qs = search.toString();
  return qs ? `/estimates?${qs}` : "/estimates";
}
