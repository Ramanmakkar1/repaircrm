import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Hash } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InitialsVisual } from "@/components/ui/record-card";
import { DocumentGrid, InvoiceCard } from "@/components/billing/document-cards";
import { MoneyRows, Section, type MoneyRowData } from "@/components/billing/bill-lines";
import { loadShopZone } from "@/components/billing/print-queries";
import { shopNow, shopWall } from "@/components/billing/shop-clock";
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
import { PERIOD_PRESETS, presetRange, resolvePeriod } from "@/components/statements/period";
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
      ? `Statement · ${statementCustomerName(customer)} · Repairs helper`
      : "Statement · Repairs helper",
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
  const [{ id }, query, { simple }, zone] = await Promise.all([
    params,
    searchParams,
    readUiPrefs(),
    loadShopZone(shopId),
  ]);

  // The period is the shop's own days (its zone), and "late" is judged on the
  // shop's calendar too.
  const nowMs = requestNow();
  const wallNow = shopNow(nowMs, zone);
  const period = resolvePeriod(query.from, query.to, new Date(nowMs), zone);
  const statement = await loadStatement(shopId, id, period);
  if (!statement) notFound();

  const { customer, invoices, payments, refunds, totals, owing } = statement;
  const name = statementCustomerName(customer);
  const printHref = `/print/statements/${customer.id}?from=${period.fromValue}&to=${period.toValue}`;
  const basePath = `/customers/${customer.id}/statement`;

  // ============================================================== Easy
  // A statement hero: the one answer (what they owe right now), the two
  // things you do with a statement (email it, print it), the period as pill
  // tabs, then the period's invoices as cards and its money as rows.
  if (simple) {
    const owedNow = owing.reduce((sum, row) => sum + row.balanceCents, 0);
    const lateCount = owing.filter((row) => isOverdue(row.dueDate, row.balanceCents, wallNow)).length;
    const todayValue = new Date(wallNow).toISOString().slice(0, 10);
    const today = new Date(`${todayValue}T00:00:00.000Z`);
    const tabs = PERIOD_PRESETS.map((preset) => {
      const range = presetRange(preset.days, today);
      return {
        label: preset.label,
        href: `${basePath}?from=${range.from}&to=${range.to}`,
        active: period.presetDays === preset.days,
      };
    });
    // Newest first, payments and refunds together, as they happened.
    const moneyRows: MoneyRowData[] = [
      ...payments.map((payment) => ({
        row: {
          id: payment.id,
          kind: "payment" as const,
          title: `${PAYMENT_METHOD_LABELS[payment.method] ?? payment.method} · invoice #${payment.invoiceNumber}`,
          detail: formatDate(payment.createdAt, zone),
          amountCents: payment.amountCents,
        },
        at: payment.createdAt.getTime(),
      })),
      ...refunds.map((refund) => ({
        row: {
          id: refund.id,
          kind: "refund" as const,
          title: `Refund · ${PAYMENT_METHOD_LABELS[refund.method] ?? refund.method} · invoice #${refund.invoiceNumber}`,
          detail: `${formatDate(refund.createdAt, zone)}${refund.status === "pending" ? " · on its way" : ""}`,
          note: refund.reason,
          amountCents: refund.amountCents,
        },
        at: refund.createdAt.getTime(),
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .map((entry) => entry.row);

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section aria-label="What they owe" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <InitialsVisual name={name} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[15px] font-semibold text-muted-foreground">Statement for</p>
              <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight text-foreground">
                <Link href={`/customers/${customer.id}`} className="hover:underline">{name}</Link>
              </h1>
              <p className={cn("rf-num text-[30px] font-bold leading-tight tracking-tight", owedNow > 0 ? (lateCount > 0 ? "text-status-overdue-fg" : "text-foreground") : "text-status-resolved-fg")}>
                {owedNow > 0 ? `Owes ${formatCents(owedNow)}` : "Owes nothing"}
              </p>
              <p className="text-base text-muted-foreground">
                {owedNow > 0
                  ? `${owing.length} unpaid invoice${owing.length === 1 ? "" : "s"}${lateCount > 0 ? ` · ${lateCount} late` : ""} · right now`
                  : "Every invoice is paid."}
                {customer.creditBalanceCents > 0
                  ? ` Has ${formatCents(customer.creditBalanceCents)} store credit to spend.`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:w-64">
            <Button asChild className="h-14 w-full px-6 text-lg">
              <Link href={printHref} target="_blank">
                <ICONS.print /> Print statement
              </Link>
            </Button>
            <EmailStatementButton
              customerId={customer.id}
              from={period.fromValue}
              to={period.toValue}
              disabledReason={customer.email ? undefined : "No email address on file"}
              className="h-14 w-full px-6 text-lg"
            />
          </div>
        </section>

        <div className="flex flex-col gap-3">
          <FilterTabs aria-label="Statement period" tabs={tabs} />
          <details open={period.presetDays === null} className="group w-full rounded-2xl border border-border bg-surface sm:w-fit sm:open:w-full">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-6 rounded-2xl px-4 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span>
                Pick your own dates
                {period.presetDays === null ? (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {formatDate(period.from)} – {formatDate(period.to)}
                  </span>
                ) : null}
              </span>
            </summary>
            <form method="get" action={basePath} className="flex flex-wrap items-end gap-3 border-t border-border p-4">
              <label className="flex flex-col gap-1">
                <span className="text-[14px] font-semibold text-muted-foreground">From</span>
                <input type="date" name="from" defaultValue={period.fromValue} className="h-12 rounded-xl border border-border-strong bg-surface px-3.5 text-[15px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[14px] font-semibold text-muted-foreground">To</span>
                <input type="date" name="to" defaultValue={period.toValue} className="h-12 rounded-xl border border-border-strong bg-surface px-3.5 text-[15px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </label>
              <Button type="submit" variant="outline" className="h-12 px-5 text-base">Show these dates</Button>
            </form>
          </details>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Billed", value: formatCents(totals.invoicedCents) },
            { label: "Paid", value: formatCents(totals.paidCents) },
            { label: "Refunded", value: formatCents(totals.refundedCents) },
            { label: "Still owed on these", value: formatCents(totals.outstandingCents) },
          ].map((figure) => (
            <div key={figure.label} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
              <dt className="text-[14px] font-semibold text-muted-foreground">{figure.label}</dt>
              <dd className="rf-num text-2xl font-semibold tracking-tight text-foreground">{figure.value}</dd>
            </div>
          ))}
        </dl>

        <Section title={`Invoices from ${formatDate(period.from)} to ${formatDate(period.to)}`}>
          {invoices.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong px-5 py-6 text-base text-muted-foreground">
              No invoices in these dates. Pick a longer period above.
            </p>
          ) : (
            <DocumentGrid>
              {invoices.map((invoice) => (
                <li key={invoice.id}>
                  <InvoiceCard
                    now={wallNow}
                    invoice={{
                      id: invoice.id,
                      number: invoice.number,
                      customerName: name,
                      status: invoice.status,
                      createdAt: shopWall(invoice.createdAt, zone) ?? invoice.createdAt,
                      dueDate: invoice.dueDate,
                      paidAt: null,
                      totalCents: invoice.totalCents,
                      balanceCents: invoice.balanceCents,
                    }}
                  />
                </li>
              ))}
            </DocumentGrid>
          )}
        </Section>

        <Section title="Money in and out">
          <MoneyRows rows={moneyRows} empty="No payments or refunds in these dates." />
        </Section>
      </div>
    );
  }

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
        todayValue={new Date(wallNow).toISOString().slice(0, 10)}
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
                      !voided && isOverdue(invoice.dueDate, invoice.balanceCents, wallNow);
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
                          {formatDate(invoice.createdAt, zone)}
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
                        {/* Net of refunds, so Total − Paid = Balance on every row. */}
                        <Td className="text-right tabular-nums text-muted-foreground">
                          {formatCents(invoice.paidCents - invoice.refundedCents)}
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
          title={refunds.length > 0 ? "Payments and refunds" : "Payments received"}
          action={<Chip className="tabular-nums">{formatCents(totals.paidCents)}</Chip>}
        />
        <CardContent className="px-0 py-0">
          {payments.length === 0 && refunds.length === 0 ? (
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
                        {formatDate(payment.createdAt, zone)}
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
                  {refunds.map((refund) => (
                    <Tr key={refund.id}>
                      <Td className="tabular-nums text-muted-foreground">
                        {formatDate(refund.createdAt, zone)}
                      </Td>
                      <Td>
                        <Link
                          href={`/invoices/${refund.invoiceId}`}
                          className="font-semibold tabular-nums text-foreground transition-colors hover:text-accent"
                        >
                          #{refund.invoiceNumber}
                        </Link>
                      </Td>
                      <Td className="text-muted-foreground">
                        Refund · {PAYMENT_METHOD_LABELS[refund.method] ?? refund.method}
                      </Td>
                      <Td className="text-muted-foreground">{refund.reason ?? "—"}</Td>
                      <Td className="text-right font-semibold tabular-nums text-destructive">
                        −{formatCents(refund.amountCents)}
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

