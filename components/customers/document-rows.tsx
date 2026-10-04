import * as React from "react";
import Link from "next/link";
import { AlertCircle, FileText, Receipt } from "lucide-react";

import { calcTotals, formatCents } from "@/lib/money";
import { EstimateStatusBadge, InvoiceStatusBadge } from "@/components/billing/status-badge";
import { estimateCardLine, estimateMoneyLine, type CardLine, type MoneyLine, type MoneyTone } from "@/components/billing/record-format";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ICONS } from "@/components/ui/icons";
import { IconVisual, MetaChip, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { invoiceRowFigures, type InvoiceRowInput } from "./customer-screen";

export type CustomerInvoiceRow = InvoiceRowInput & { id: string; number: number };

export type CustomerEstimateRow = {
  id: string;
  number: number;
  status: string;
  taxRateBps: number;
  createdAt: Date;
  expiresAt: Date | null;
  approvedAt: Date | null;
  lines: { quantity: number; unitPriceCents: number; taxable: boolean }[];
};

const MONEY_TONE: Record<MoneyTone, string> = {
  owed: "text-foreground",
  overdue: "text-status-overdue-fg",
  paid: "text-status-resolved-fg",
  muted: "text-muted-foreground",
};

/** "Raised Sep 18 · due Oct 2", the due part in the alert colour once it is late. */
function Line({ line }: { line: CardLine }) {
  return (
    <>
      {line.lead}
      {line.tail ? (
        <>
          {/* A non-breaking space keeps the dot with the word before it when the line wraps. */}
          {" · "}
          <span className={cn(line.late && "font-semibold text-status-overdue-fg")}>{line.tail}</span>
        </>
      ) : null}
    </>
  );
}

/**
 * The total, then the balance in words ("$27.05 due", "Paid"). Drawn twice and
 * CSS shows one: a column on the right from a tablet up, a row under the chips
 * on a phone, where a right-hand column would leave the title four letters.
 */
function Money({ cents, money, struck, where }: { cents: number; money: MoneyLine; struck?: boolean; where: "column" | "row" }) {
  const total = (
    <span className={cn("rf-num text-xl font-semibold leading-tight tabular-nums", struck ? "text-faint-foreground line-through" : "text-foreground")}>
      {formatCents(cents)}
    </span>
  );
  const words = money.text ? <span className={cn("rf-num text-sm font-semibold leading-tight", MONEY_TONE[money.tone])}>{money.text}</span> : null;

  return where === "column" ? (
    <span className="hidden h-full min-w-20 flex-col items-end justify-center gap-0.5 text-right sm:flex">
      {total}
      {words}
    </span>
  ) : (
    <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3 pt-1 sm:hidden">
      {total}
      {words}
    </span>
  );
}

/** On a phone the money moves into the chip row, so the kit's right-hand slot is hidden outright (its gap would still cost 16px). */
const PHONE_NO_TRAILING = "max-sm:[&>span:last-child]:hidden";

export function InvoiceRow({ invoice, now }: { invoice: CustomerInvoiceRow; now: number }) {
  const figures = invoiceRowFigures(invoice, now);
  const voided = invoice.status === "VOID";

  return (
    <RecordCard
      href={`/invoices/${invoice.id}`}
      className={cn("h-full", PHONE_NO_TRAILING)}
      visual={<IconVisual icon={Receipt} />}
      title={<span className={cn(voided && "text-faint-foreground line-through")}>Invoice #{invoice.number}</span>}
      subtitle={<Line line={figures.line} />}
      meta={
        <>
          <InvoiceStatusBadge status={invoice.status} size="md" />
          {figures.overdue ? (
            <MetaChip tone="alert" icon={AlertCircle}>
              {figures.overdue}
            </MetaChip>
          ) : null}
          <Money cents={figures.totalCents} money={figures.money} struck={voided} where="row" />
        </>
      }
      trailing={<Money cents={figures.totalCents} money={figures.money} struck={voided} where="column" />}
    />
  );
}

export function EstimateRow({ estimate, now }: { estimate: CustomerEstimateRow; now: number }) {
  const { totalCents } = calcTotals(estimate.lines, estimate.taxRateBps);
  const line = estimateCardLine(estimate, now);
  const money = estimateMoneyLine(estimate.status);

  return (
    <RecordCard
      href={`/estimates/${estimate.id}`}
      className={cn("h-full", PHONE_NO_TRAILING)}
      visual={<IconVisual icon={FileText} />}
      title={`Estimate #${estimate.number}`}
      subtitle={<Line line={line} />}
      meta={
        <>
          <EstimateStatusBadge status={estimate.status} size="md" />
          {line.late ? (
            <MetaChip tone="alert" icon={AlertCircle}>
              Quote expired
            </MetaChip>
          ) : null}
          <Money cents={totalCents} money={money} where="row" />
        </>
      }
      trailing={<Money cents={totalCents} money={money} where="column" />}
    />
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title}
        {count ? (
          <span className="rf-num min-w-6 rounded-full bg-surface-hover px-1.5 py-0.5 text-center text-[13px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

/**
 * The Invoices section: what the customer has been billed, newest first, each
 * with its balance in words. Their estimates (quotes) sit under it as a second
 * group, so nothing the old screen showed has gone.
 */
export function CustomerInvoices({
  customerId,
  invoices,
  invoiceTotal,
  estimates,
  estimateTotal,
  now,
}: {
  customerId: string;
  invoices: CustomerInvoiceRow[];
  invoiceTotal: number;
  estimates: CustomerEstimateRow[];
  estimateTotal: number;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      {invoices.length > 0 ? (
        <Group title="Invoices" count={invoiceTotal}>
          <RecordGrid className="md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-2">
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <InvoiceRow invoice={invoice} now={now} />
              </li>
            ))}
          </RecordGrid>
          {invoiceTotal > invoices.length ? (
            <Button variant="outline" size="lg" className="h-14 w-full text-base sm:w-auto sm:self-start" asChild>
              <Link href={`/invoices?customerId=${customerId}`}>See all {invoiceTotal} invoices</Link>
            </Button>
          ) : null}
        </Group>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center">
          <ICONS.invoice className="size-10 text-faint-foreground" strokeWidth={1.4} aria-hidden />
          <div className="flex max-w-sm flex-col gap-1">
            <p className="text-lg font-semibold">No invoices yet</p>
            <p className="text-base text-muted-foreground">Bills for this customer will show here with what is still owed.</p>
          </div>
          <Button size="lg" className="h-14 px-8 text-base" asChild>
            <Link href={`/invoices/new?customerId=${customerId}`}>
              <ICONS.invoice className="size-5" aria-hidden />
              New invoice
            </Link>
          </Button>
        </div>
      )}

      {estimates.length > 0 ? (
        <Group title="Estimates" count={estimateTotal}>
          <RecordGrid className="md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-2">
            {estimates.map((estimate) => (
              <li key={estimate.id}>
                <EstimateRow estimate={estimate} now={now} />
              </li>
            ))}
          </RecordGrid>
          {estimateTotal > estimates.length ? (
            <Button variant="outline" size="lg" className="h-14 w-full text-base sm:w-auto sm:self-start" asChild>
              <Link href={`/estimates?customerId=${customerId}`}>See all {estimateTotal} estimates</Link>
            </Button>
          ) : null}
        </Group>
      ) : null}
    </div>
  );
}
