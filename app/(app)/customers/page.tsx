import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { CustomerSearch } from "@/components/customers/customer-search";
import { formatDate, plural } from "@/components/customers/format";
import { RowLink } from "@/components/list/row-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";

export const metadata: Metadata = { title: "Customers · RepairPilot" };

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
  const { shopId, role } = await requireUser();
  const params = await searchParams;

  // Front desk keeps the customer book, so they get the importer too; a tech
  // has no reason to bulk-load customers.
  const canImport = role === "OWNER" || role === "FRONT_DESK";
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
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Customers"
        description="Every account the shop has on file, with what they owe and what's open."
        actions={
          <>
            {canImport ? (
              <Button variant="outline" asChild>
                <Link href="/customers/import">
                  <ICONS.importData />
                  Import
                </Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/customers/new">
                <ACTIONS.add />
                New Customer
              </Link>
            </Button>
          </>
        }
      />

      <CustomerSearch query={query} />

      <Card className="overflow-hidden">
        <CardContent className="px-0 py-0">
          {customers.length === 0 ? (
            <EmptyState
              icon={ICONS.customer}
              title={query ? "No matching customers" : "No customers yet"}
              hint={
                query
                  ? `Nothing matches “${query}”. Try a shorter search.`
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
                      <ACTIONS.add />
                      New Customer
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
                    <Th>Name</Th>
                    <Th>Business</Th>
                    <Th>Phone</Th>
                    <Th>Email</Th>
                    <Th>Customer since</Th>
                    <Th className="text-right">Open</Th>
                    <Th className="text-right">Balance</Th>
                  </Tr>
                </THead>
                <TBody>
                  {customers.map((customer) => {
                    const open = openTickets.get(customer.id) ?? 0;
                    const balance = balances.get(customer.id) ?? 0;
                    const phone = customer.phone ?? customer.mobile;
                    const name = `${customer.firstName} ${customer.lastName}`.trim();

                    return (
                      <RowLink key={customer.id} href={`/customers/${customer.id}`}>
                        <Td>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="block max-w-[200px] truncate font-semibold text-foreground hover:underline"
                            title={name}
                          >
                            {name}
                          </Link>
                        </Td>

                        <Td className={customer.businessName ? "text-muted-foreground" : "text-faint-foreground"}>
                          <span className="block max-w-[180px] truncate">
                            {customer.businessName ?? "—"}
                          </span>
                        </Td>

                        <Td className={phone ? "rf-num" : "text-faint-foreground"}>
                          {phone ?? "—"}
                        </Td>

                        <Td className={customer.email ? "text-muted-foreground" : "text-faint-foreground"}>
                          <span className="block max-w-[220px] truncate">
                            {customer.email ?? "—"}
                          </span>
                        </Td>

                        <Td className="text-muted-foreground">
                          {formatDate(customer.createdAt)}
                        </Td>

                        {/*
                          The two facts that decide whether this row needs a
                          phone call. On a card they were pills; in a ledger
                          they are figures, and a figure that is zero should
                          not be as loud as one that isn't.
                        */}
                        <Td
                          className={cn(
                            "text-right tabular-nums",
                            open > 0
                              ? "font-semibold text-foreground"
                              : "text-faint-foreground",
                          )}
                        >
                          {open > 0 ? open : "—"}
                        </Td>

                        <Td
                          className={cn(
                            "text-right tabular-nums",
                            balance > 0
                              ? "font-semibold text-status-overdue-fg"
                              : "text-faint-foreground",
                          )}
                        >
                          {balance > 0 ? formatCents(balance) : "—"}
                        </Td>
                      </RowLink>
                    );
                  })}
                </TBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                <p className="rf-num text-[12.5px] font-medium text-muted-foreground">
                  {firstRow}–{lastRow} of {plural(total, "customer")}
                </p>
                {pageCount > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <PageLink
                      href={pageHref(query, page - 1)}
                      disabled={page <= 1}
                      label="Previous"
                    >
                      <ACTIONS.back />
                      Previous
                    </PageLink>
                    <span className="rf-num px-1 text-[12.5px] font-medium text-muted-foreground">
                      {page} / {pageCount}
                    </span>
                    <PageLink
                      href={pageHref(query, page + 1)}
                      disabled={page >= pageCount}
                      label="Next"
                    >
                      Next
                      <ACTIONS.next />
                    </PageLink>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
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
      <Button variant="outline" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
