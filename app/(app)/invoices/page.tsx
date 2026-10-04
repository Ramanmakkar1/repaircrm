import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { customerMatchClauses, documentNumber } from "@/lib/customers/phone-search";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";
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
import { SavedViewsControl } from "@/components/list/saved-views";
import { listSavedViews } from "@/lib/saved-views-query";
import { normalizeViewQuery, savedViewHref } from "@/lib/saved-views";
import {
  BulkBar,
  SelectAll,
  SelectRow,
  SelectionScope,
} from "@/components/list/selection";
import { DocumentGrid, InvoiceCard } from "@/components/billing/document-cards";
import { BillingFilterBar } from "@/components/billing/filter-bar";
import { InvoiceBulkActions } from "@/components/billing/invoice-bulk-actions";
import { formatDate, isOverdue } from "@/components/billing/format";
import { PAGE_SIZE, Pagination } from "@/components/billing/pagination";
import { invoiceTabCounts } from "@/components/billing/record-format";
import { refundAwareTotals } from "@/components/billing/refund-math";
import {
  INVOICE_STATUS_OPTIONS,
  INVOICE_STATUSES,
  InvoiceStatusBadge,
} from "@/components/billing/status-badge";

export const metadata = { title: "Invoices · Repairs helper" };

const STATUS_SET = new Set<string>(INVOICE_STATUSES);
const UNPAID_VIEW = "unpaid";
const INVOICE_VIEWS = [
  { value: "", label: "All" },
  { value: UNPAID_VIEW, label: "Unpaid" },
  ...INVOICE_STATUS_OPTIONS,
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const [params, prefs] = await Promise.all([searchParams, readUiPrefs()]);
  // Easy mode (the default) shows cards and big buttons. Full mode keeps the
  // dense table, the bulk actions and the saved views exactly as they were.
  const easy = prefs.simple;

  /*
    This user's saved filters for this screen. `currentQuery` is normalised the
    same way a stored one is — sorted, paging stripped — so a saved view lights
    up whether you clicked its tab or rebuilt the same filter by hand.
  */
  const savedViews = await listSavedViews("/invoices");
  const currentQuery = normalizeViewQuery(
    new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value] as [string, string]] : [],
      ),
    ).toString(),
  );

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusParam = typeof params.status === "string" ? params.status : "";
  // "unpaid" is a view, not a stored status: sent and part-paid invoices, i.e.
  // everything the shop is still owed (what Home and the dashboard count).
  const status = statusParam === UNPAID_VIEW || STATUS_SET.has(statusParam) ? statusParam : "";
  const customerId = typeof params.customerId === "string" ? params.customerId : "";
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);

  // Tenant boundary first, then the branch on screen, then the user's filters.
  const branch = await locationWhere();
  const where: Prisma.InvoiceWhereInput = { shopId, ...branch };
  if (status === UNPAID_VIEW) where.status = { in: ["SENT", "PARTIAL"] };
  else if (status) where.status = status as Prisma.InvoiceWhereInput["status"];
  if (customerId) where.customerId = customerId;

  if (q) {
    const asNumber = documentNumber(q);
    where.OR = [
      ...(asNumber !== null ? [{ number: asNumber }] : []),
      ...(await customerMatchClauses(shopId, q)).map((customer) => ({ customer })),
    ];
  }

  const [total, invoices, filteredCustomer, statusCounts] = await Promise.all([
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
    // The number inside each Easy-mode tab. It follows the branch and the
    // customer filter, but not the view or the search: a tab's count is "how
    // many are in this view", and typing in the box must not change that.
    easy
      ? db.invoice.groupBy({
          by: ["status"],
          where: { shopId, ...branch, ...(customerId ? { customerId } : {}) },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const filtered = Boolean(q || status || customerId);
  const now = requestNow();
  const tabCounts = easy ? invoiceTabCounts(statusCounts) : null;

  const emptyState = (
    <EmptyState
      icon={ICONS.invoice}
      title={filtered ? "No invoices match those filters" : "No invoices yet"}
      hint={
        filtered
          ? "Try a different search term, or pick another view."
          : "Raise one from a repair, or start from scratch."
      }
      action={
        filtered ? (
          <Button variant="outline" asChild className={cn(easy && "px-6 text-base")}>
            <Link href="/invoices">Clear filters</Link>
          </Button>
        ) : (
          <Button asChild className={cn(easy && "px-6 text-base")}>
            <Link href="/invoices/new">
              <ACTIONS.add /> New invoice
            </Link>
          </Button>
        )
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        description={
          easy
            ? "Bill customers and see who still owes you."
            : "Bill customers and track payment status."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className={cn(easy && "px-5 text-base")}>
              <Link href="/invoices/recurring">
                <ICONS.recurring /> Recurring
              </Link>
            </Button>
            <Button asChild className={cn(easy && "px-5 text-base")}>
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
          tabs={[
            ...INVOICE_VIEWS.map(
              (view) => ({
                label: view.label,
                href: hrefFor(view.value, q, customerId),
                active: status === view.value,
                ...(tabCounts ? { count: tabCounts[view.value] ?? 0 } : {}),
              }),
            ),
            ...savedViews.map((view) => ({
              label: view.name,
              href: savedViewHref("/invoices", view.query),
              active: view.query === currentQuery,
            })),
          ]}
          trailing={
            <SavedViewsControl
              path="/invoices"
              views={savedViews}
              builtIn={INVOICE_VIEWS.map((view) => ({
                label: view.label,
                query: normalizeViewQuery(
                  new URLSearchParams(
                    view.value ? { status: view.value } : {},
                  ).toString(),
                ),
              }))}
            />
          }
        />

        <BillingFilterBar
          basePath="/invoices"
          q={q}
          status={status}
          customerId={customerId}
          placeholder={
            easy
              ? "Name, phone or number"
              : "Search by invoice #, customer or phone…"
          }
          large={easy}
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

      {easy ? (
        invoices.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">{emptyState}</div>
        ) : (
          <>
            <DocumentGrid>
              {invoices.map((invoice) => {
                const totals = refundAwareTotals(
                  invoice.lines,
                  invoice.taxRateBps,
                  invoice.payments,
                  invoice.refunds,
                );
                return (
                  <li key={invoice.id}>
                    <InvoiceCard
                      now={now}
                      invoice={{
                        id: invoice.id,
                        number: invoice.number,
                        customerName: customerLabel(invoice.customer),
                        status: invoice.status,
                        createdAt: invoice.createdAt,
                        dueDate: invoice.dueDate,
                        paidAt: invoice.paidAt,
                        totalCents: totals.totalCents,
                        balanceCents: totals.balanceCents,
                      }}
                    />
                  </li>
                );
              })}
            </DocumentGrid>
            <Pagination
              big
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
        )
      ) : null}

      {/* Full mode: the dense table. Table and action bar share one selection; the provider adds no DOM. */}
      {!easy ? (
        <SelectionScope ids={invoices.map((invoice) => invoice.id)}>
          <Card>
            <CardContent className="px-0 py-0">
              {invoices.length === 0 ? (
                emptyState
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
      ) : null}
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
