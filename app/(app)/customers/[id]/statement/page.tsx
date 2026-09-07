import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Hash } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  StatTile,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { formatDate, isOverdue } from "@/components/billing/format";
import { InvoiceStatusBadge } from "@/components/billing/status-badge";
import { EmailStatementButton } from "@/components/statements/email-statement-button";
import { resolvePeriod } from "@/components/statements/period";
import { StatementPeriodPicker } from "@/components/statements/period-picker";
import {
  PAYMENT_METHOD_LABELS,
  loadStatement,
  statementCustomerName,
} from "@/components/statements/query";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, shopId },
    select: { firstName: true, lastName: true, businessName: true },
  });

  return {
    title: customer
      ? `Statement · ${statementCustomerName(customer)} · RepairFlow`
      : "Statement · RepairFlow",
  };
}

export default async function CustomerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const period = resolvePeriod(query.from, query.to);
  const statement = await loadStatement(shopId, id, period);
  if (!statement) notFound();

  const { customer, invoices, payments, totals } = statement;
  const name = statementCustomerName(customer);
  const printHref = `/print/statements/${customer.id}?from=${period.fromValue}&to=${period.toValue}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: name, href: `/customers/${customer.id}` },
          { label: "Statement" },
        ]}
        title="Statement"
        description={`${name} · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        actions={
          <>
            <EmailStatementButton
              customerId={customer.id}
              from={period.fromValue}
              to={period.toValue}
              disabledReason={
                customer.email ? undefined : "No email address on file"
              }
            />
            <Button variant="outline" asChild>
              <Link href={printHref} target="_blank">
                <ICONS.print />
                Print
              </Link>
            </Button>
          </>
        }
      />

      <StatementPeriodPicker
        basePath={`/customers/${customer.id}/statement`}
        fromValue={period.fromValue}
        toValue={period.toValue}
        presetDays={period.presetDays}
      />

      {/* ------------------------------------------------------- the numbers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={ICONS.invoice}
          label="Total invoiced"
          value={formatCents(totals.invoicedCents)}
        />
        <StatTile
          icon={ICONS.cash}
          label="Total paid"
          value={formatCents(totals.paidCents)}
        />
        <StatTile
          icon={ICONS.payment}
          tone={totals.outstandingCents > 0 ? "danger" : "success"}
          label="Balance outstanding"
          value={formatCents(totals.outstandingCents)}
          hint={
            totals.outstandingCents > 0 ? "still owed" : "settled in full"
          }
        />
        <StatTile
          icon={ICONS.credit}
          tone={totals.creditBalanceCents > 0 ? "success" : "neutral"}
          label="Store credit held"
          value={formatCents(totals.creditBalanceCents)}
          hint="Spendable at checkout"
        />
      </div>

      {/* ---------------------------------------------------------- invoices */}
      <Card>
        <CardHeader
          icon={ICONS.invoice}
          title="Invoices in this period"
          action={<Chip>{invoices.length}</Chip>}
        />
        <CardContent className="px-0 py-0">
          {invoices.length === 0 ? (
            <EmptyState
              icon={ICONS.invoice}
              title="No invoices in this period"
              hint="Widen the date range, or check the customer's full history on their hub."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-[110px]">Invoice</Th>
                    <Th className="w-[140px]">Date</Th>
                    <Th className="w-[130px]">Status</Th>
                    <Th className="w-[140px]">Due</Th>
                    <Th className="w-[130px] text-right">Total</Th>
                    <Th className="w-[130px] text-right">Paid</Th>
                    <Th className="w-[130px] text-right">Balance</Th>
                  </Tr>
                </THead>
                <TBody>
                  {invoices.map((invoice) => {
                    const voided = invoice.status === "VOID";
                    const overdue =
                      !voided && isOverdue(invoice.dueDate, invoice.balanceCents);
                    const settled = !voided && invoice.balanceCents <= 0;
                    return (
                      <Tr key={invoice.id}>
                        <Td>
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="inline-flex items-center gap-1 font-semibold tabular-nums text-foreground transition-colors hover:text-accent"
                          >
                            <Hash className="size-3.5 text-faint-foreground" />
                            {invoice.number}
                          </Link>
                        </Td>
                        <Td className="tabular-nums text-muted-foreground">
                          {formatDate(invoice.createdAt)}
                        </Td>
                        <Td>
                          <InvoiceStatusBadge status={invoice.status} />
                        </Td>
                        <Td
                          className={cn(
                            "tabular-nums text-muted-foreground",
                            overdue && "font-bold text-status-overdue-fg",
                          )}
                        >
                          {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
                        </Td>
                        <Td
                          className={cn(
                            "text-right font-semibold tabular-nums text-foreground",
                            voided && "text-faint-foreground line-through",
                          )}
                        >
                          {formatCents(invoice.totalCents)}
                        </Td>
                        <Td className="text-right tabular-nums text-muted-foreground">
                          {formatCents(invoice.paidCents)}
                        </Td>
                        <Td
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            settled ? "text-status-resolved-fg" : "text-foreground",
                          )}
                        >
                          {voided
                            ? "—"
                            : settled
                              ? "Paid"
                              : formatCents(invoice.balanceCents)}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- payments */}
      <Card>
        <CardHeader
          icon={ICONS.payment}
          title="Payments received"
          action={<Chip className="tabular-nums">{formatCents(totals.paidCents)}</Chip>}
        />
        <CardContent className="px-0 py-0">
          {payments.length === 0 ? (
            <EmptyState
              icon={ICONS.payment}
              title="No payments in this period"
              hint="Payments show here on the date they were taken, whichever invoice they landed on."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-[150px]">Date</Th>
                    <Th className="w-[120px]">Invoice</Th>
                    <Th className="w-[150px]">Method</Th>
                    <Th>Reference</Th>
                    <Th className="w-[140px] text-right">Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {payments.map((payment) => (
                    <Tr key={payment.id}>
                      <Td className="tabular-nums text-muted-foreground">
                        {formatDate(payment.createdAt)}
                      </Td>
                      <Td>
                        <Link
                          href={`/invoices/${payment.invoiceId}`}
                          className="font-semibold tabular-nums text-foreground transition-colors hover:text-accent"
                        >
                          #{payment.invoiceNumber}
                        </Link>
                      </Td>
                      <Td className="text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                      </Td>
                      <Td className="text-muted-foreground">
                        {payment.reference ? (
                          <span className="font-mono text-[12.5px]">
                            {payment.reference}
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums text-foreground">
                        {formatCents(payment.amountCents)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

