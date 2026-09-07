import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { formatCents } from "@/lib/money";
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
import {
  BulkBar,
  SelectAll,
  SelectRow,
  SelectionScope,
} from "@/components/list/selection";
import { BillingFilterBar } from "@/components/billing/filter-bar";
import { InvoiceBulkActions } from "@/components/billing/invoice-bulk-actions";
import { formatDate, isOverdue } from "@/components/billing/format";
import { PAGE_SIZE, Pagination } from "@/components/billing/pagination";
import { refundAwareTotals } from "@/components/billing/refund-math";
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

  // Tenant boundary first, then the branch on screen, then the user's filters.
  const where: Prisma.InvoiceWhereInput = { shopId, ...(await locationWhere()) };
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

  const [total, invoices, filteredCustomer] = await Promise.all([
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
        // Refunds are loaded here for the same reason the detail page loads
        // them: the stored status is walked back to PARTIAL when money goes
        // out again, so a balance computed without them would print "Paid"
        // beside a "Partial" badge on the same row.
        refunds: { select: { amountCents: true, status: true } },
      },
    }),
    // Only to name the chip. The customer filter arrives by URL from the
    // customer page and used to be completely invisible once you got here.
    customerId
      ? db.customer.findFirst({
          where: { id: customerId, shopId },
          select: { firstName: true, lastName: true, businessName: true },
        })
      : null,
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
                <ICONS.recurring /> Recurring
              </Link>
            </Button>
            <Button asChild>
              <Link href="/invoices/new">
                <ACTIONS.add /> New invoice
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterTabs
          aria-label="Invoice views"
          tabs={[{ value: "", label: "All" }, ...INVOICE_STATUS_OPTIONS].map(
            (view) => ({
              label: view.label,
              href: hrefFor(view.value, q, customerId),
              active: status === view.value,
            }),
          )}
        />

        <BillingFilterBar
          basePath="/invoices"
          q={q}
          status={status}
          customerId={customerId}
          placeholder="Search by invoice # or customer…"
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

      {/* Table and action bar share one selection; the provider adds no DOM. */}
      <SelectionScope ids={invoices.map((invoice) => invoice.id)}>
        <Card>
          <CardContent className="px-0 py-0">
            {invoices.length === 0 ? (
              <EmptyState
                icon={ICONS.invoice}
                title={filtered ? "No invoices match those filters" : "No invoices yet"}
                hint={
                  filtered
                    ? "Try a different search term, or pick another view."
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
                        <ACTIONS.add /> New invoice
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
                      <SelectAll />
                      <Th>Invoice</Th>
                      <Th>Customer</Th>
                      <Th>Status</Th>
                      <Th>Raised</Th>
                      <Th>Due</Th>
                      <Th className="text-right">Total</Th>
                      <Th className="text-right">Balance</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {invoices.map((invoice) => {
                      const totals = refundAwareTotals(
                        invoice.lines,
                        invoice.taxRateBps,
                        invoice.payments,
                        invoice.refunds,
                      );
                      const voided = invoice.status === "VOID";
                      const overdue = isOverdue(invoice.dueDate, totals.balanceCents);
                      const settled = !voided && totals.balanceCents <= 0;

                      return (
                        <RowLink key={invoice.id} href={`/invoices/${invoice.id}`}>
                          <SelectRow
                            id={invoice.id}
                            label={`invoice #${invoice.number}`}
                          />
                          <Td>
                            <Link
                              href={`/invoices/${invoice.id}`}
                              className={cn(
                                "rf-id font-semibold text-accent-soft-foreground hover:underline",
                                voided && "text-faint-foreground line-through",
                              )}
                            >
                              #{invoice.number}
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
                              {customerLabel(invoice.customer)}
                            </span>
                          </Td>
                          <Td>
                            <InvoiceStatusBadge status={invoice.status} size="md" />
                          </Td>
                          <Td className="text-muted-foreground">
                            {formatDate(invoice.createdAt)}
                          </Td>
                          {/* Red on the date is what the card's left stripe used to
                              say, spent on the cell that actually explains it. */}
                          <Td
                            className={cn(
                              "text-muted-foreground",
                              overdue && "font-semibold text-status-overdue-fg",
                            )}
                          >
                            {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                          </Td>
                          <Td
                            className={cn(
                              "text-right font-semibold text-foreground",
                              voided && "text-faint-foreground line-through",
                            )}
                          >
                            {formatCents(totals.totalCents)}
                          </Td>
                          <Td className="text-right font-semibold">
                            {voided ? (
                              <span className="text-faint-foreground">—</span>
                            ) : settled ? (
                              <span className="text-status-resolved-fg">Paid</span>
                            ) : (
                              <span
                                className={
                                  overdue ? "text-status-overdue-fg" : "text-foreground"
                                }
                              >
                                {formatCents(totals.balanceCents)}
                              </span>
                            )}
                          </Td>
                        </RowLink>
                      );
                    })}
                  </TBody>
                </Table>

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
          </CardContent>
        </Card>

        <BulkBar noun="invoice">
          <InvoiceBulkActions />
        </BulkBar>
      </SelectionScope>
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
  return qs ? `/invoices?${qs}` : "/invoices";
}
