import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Invoices"
        description="Bill customers and track payment status."
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus /> New invoice
            </Link>
          </Button>
        }
      />

      <BillingFilterBar
        basePath="/invoices"
        q={q}
        status={status}
        statusOptions={INVOICE_STATUS_OPTIONS}
        placeholder="Search by invoice # or customer…"
      />

      <Card>
        <CardContent className="px-0 py-0">
          {invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={filtered ? "No invoices match those filters" : "No invoices yet"}
              hint={
                filtered
                  ? "Try a different search term or clear the status filter."
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
          ) : (
            <>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-[80px]">#</Th>
                    <Th>Customer</Th>
                    <Th className="w-[110px]">Date</Th>
                    <Th className="w-[110px]">Due</Th>
                    <Th className="w-[110px]">Status</Th>
                    <Th className="w-[110px] text-right">Total</Th>
                    <Th className="w-[110px] text-right">Balance</Th>
                  </Tr>
                </THead>
                <TBody>
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

                    return (
                      <Tr key={invoice.id}>
                        <Td>
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className={cn(
                              "font-medium tabular-nums text-accent hover:underline",
                              voided && "text-faint-foreground line-through",
                            )}
                          >
                            #{invoice.number}
                          </Link>
                        </Td>
                        <Td
                          className={cn(
                            "max-w-[280px] truncate",
                            voided && "text-faint-foreground",
                          )}
                        >
                          <Link
                            href={`/customers/${invoice.customer.id}`}
                            className="hover:underline"
                          >
                            {name}
                          </Link>
                        </Td>
                        <Td className="text-muted-foreground tabular-nums">
                          {formatDate(invoice.createdAt)}
                        </Td>
                        <Td
                          className={cn(
                            "tabular-nums",
                            overdue
                              ? "font-medium text-status-overdue"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatDate(invoice.dueDate)}
                        </Td>
                        <Td>
                          <InvoiceStatusBadge status={invoice.status} />
                        </Td>
                        <Td
                          className={cn(
                            "text-right tabular-nums",
                            voided && "text-faint-foreground line-through",
                          )}
                        >
                          {formatCents(totals.totalCents)}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {voided ? (
                            <span className="text-faint-foreground">—</span>
                          ) : totals.balanceCents <= 0 ? (
                            <span className="text-muted-foreground">
                              {formatCents(0)}
                            </span>
                          ) : (
                            <span className="font-medium text-foreground">
                              {formatCents(totals.balanceCents)}
                            </span>
                          )}
                        </Td>
                      </Tr>
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
    </div>
  );
}
