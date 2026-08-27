import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Mail, Phone, Plus, Users } from "lucide-react";

import { CustomerSearch } from "@/components/customers/customer-search";
import { formatDate, initials, plural } from "@/components/customers/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";

export const metadata: Metadata = { title: "Customers · RepairFlow" };

const PAGE_SIZE = 25;

/** Ticket statuses that mean "no longer on the bench". */
const CLOSED_TICKET_STATUSES = [
  "Resolved",
  "Closed",
  "Completed",
  "Cancelled",
  "Picked Up",
];

/** Invoice statuses that can still carry a balance the customer owes. */
const OWING_INVOICE_STATUSES: Prisma.EnumInvoiceStatusFilter["in"] = [
  "SENT",
  "PARTIAL",
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const query = (params.q ?? "").trim();
  const where = buildWhere(shopId, query);

  // Count first so an out-of-range ?page= clamps to the last real page instead
  // of rendering an "add your first customer" empty state over a full list.
  const total = await db.customer.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );

  const customers = await db.customer.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      businessName: true,
      email: true,
      phone: true,
      mobile: true,
      createdAt: true,
    },
  });

  const ids = customers.map((c) => c.id);

  // Two lean roll-ups over just the 25 rows on screen, rather than a per-row
  // include that would fan out into 25+ queries.
  const [openTicketRows, owingInvoices] = await Promise.all([
    ids.length
      ? db.ticket.groupBy({
          by: ["customerId"],
          where: {
            shopId,
            customerId: { in: ids },
            status: { notIn: CLOSED_TICKET_STATUSES },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    ids.length
      ? db.invoice.findMany({
          where: {
            shopId,
            customerId: { in: ids },
            status: { in: OWING_INVOICE_STATUSES },
          },
          select: {
            customerId: true,
            taxRateBps: true,
            lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
            payments: { select: { amountCents: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const openTickets = new Map<string, number>();
  for (const row of openTicketRows) openTickets.set(row.customerId, row._count._all);

  const balances = new Map<string, number>();
  for (const invoice of owingInvoices) {
    const { balanceCents } = invoiceTotals(
      invoice.lines,
      invoice.taxRateBps,
      invoice.payments,
    );
    if (balanceCents > 0) {
      balances.set(
        invoice.customerId,
        (balances.get(invoice.customerId) ?? 0) + balanceCents,
      );
    }
  }

  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description="Every account the shop has on file, with what they owe and what's open."
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <Plus />
              New Customer
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CustomerSearch query={query} />
        <p className="text-[13.5px] font-medium text-muted-foreground">
          {total === 0
            ? "No customers"
            : `Showing ${firstRow}–${lastRow} of ${plural(total, "customer")}`}
        </p>
      </div>

      {customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={query ? "No matching customers" : "No customers yet"}
            hint={
              query
                ? `Nothing matches \u201c${query}\u201d. Try a shorter search.`
                : "Add your first customer to start writing tickets."
            }
            action={
              query ? (
                <Button variant="outline" asChild>
                  <Link href="/customers">Clear search</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/customers/new">
                    <Plus />
                    New Customer
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => {
            const open = openTickets.get(customer.id) ?? 0;
            const balance = balances.get(customer.id) ?? 0;
            const phone = customer.phone ?? customer.mobile;
            const name = `${customer.firstName} ${customer.lastName}`.trim();

            return (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="rf-lift flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent-soft-foreground">
                    {initials(name)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[17px] font-bold leading-tight text-foreground">
                      {name}
                    </span>
                    {customer.businessName ? (
                      <span className="truncate text-[13.5px] font-medium text-muted-foreground">
                        {customer.businessName}
                      </span>
                    ) : (
                      <span className="text-[13.5px] text-faint-foreground">
                        Since {formatDate(customer.createdAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-[13.5px] text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Phone className="size-4 shrink-0 text-faint-foreground" />
                    <span className="truncate">{phone ?? "No phone on file"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Mail className="size-4 shrink-0 text-faint-foreground" />
                    <span className="truncate">{customer.email ?? "No email on file"}</span>
                  </span>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <Chip
                    className={cn(
                      open > 0 && "bg-status-in-progress-bg font-bold text-status-in-progress-fg",
                    )}
                  >
                    {open > 0 ? `${plural(open, "open ticket")}` : "No open tickets"}
                  </Chip>
                  <Chip
                    className={cn(
                      balance > 0
                        ? "bg-status-overdue-bg font-bold text-status-overdue-fg"
                        : "bg-status-resolved-bg text-status-resolved-fg",
                    )}
                  >
                    {balance > 0 ? `${formatCents(balance)} owing` : "Paid up"}
                  </Chip>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between pt-1">
          <p className="text-[13.5px] font-medium text-muted-foreground">
            Page {page} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <PageLink
              href={pageHref(query, page - 1)}
              disabled={page <= 1}
              label="Previous"
            >
              <ChevronLeft />
              Previous
            </PageLink>
            <PageLink
              href={pageHref(query, page + 1)}
              disabled={page >= pageCount}
              label="Next"
            >
              Next
              <ChevronRight />
            </PageLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Every whitespace-separated token must match at least one field, so
 * "elena marq" finds Elena Marquez while "elena okonkwo" finds nobody.
 */
function buildWhere(shopId: string, query: string): Prisma.CustomerWhereInput {
  if (!query) return { shopId };

  const tokens = query.split(/\s+/).filter(Boolean).slice(0, 5);

  return {
    shopId,
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" as const } },
        { lastName: { contains: token, mode: "insensitive" as const } },
        { businessName: { contains: token, mode: "insensitive" as const } },
        { email: { contains: token, mode: "insensitive" as const } },
        { phone: { contains: token, mode: "insensitive" as const } },
        { mobile: { contains: token, mode: "insensitive" as const } },
      ],
    })),
  };
}

function pageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" asChild>
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
