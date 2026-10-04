import * as React from "react";
import {
  CheckCircle2,
  CircleCheck,
  FilePlus2,
  FileText,
  Mail,
  MessageSquareText,
  Receipt,
  Undo2,
  CreditCard,
  ArrowRightLeft,
} from "lucide-react";

import { formatCents } from "@/lib/money";
import { cn } from "@/components/ui/cn";
import { formatDateTime } from "./format";
import { lineRow, type ActivityItem, type ActivityKind } from "./bill-display";

/**
 * The body of the POS-style bill screen (Easy mode): the lines as a list of
 * rows instead of a table, the totals as a receipt block, the payments and
 * refunds as their own list, the activity feed, and label/value facts.
 *
 * Presentational only. Amounts arrive already computed (`refundAwareTotals`,
 * `calcTotals`) and are only formatted here; nothing on this page does money
 * maths. Every column the old table carried (description, serial, quantity,
 * rate, tax flag, amount) is on the row, in words.
 */

/** A titled block of the screen: a plain heading, an optional action, then the content. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ lines --- */

export interface BillLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  /** Invoices only; an estimate has no serial. */
  serial?: string | null;
}

/**
 * One card row per line: the description large, the serial under it when there
 * is one, "2 × $60.00" and the tax flag in words under that, and the amount on
 * the right. `struck` is for a voided bill.
 */
export function LineList({ lines, struck = false }: { lines: ReadonlyArray<BillLine>; struck?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line) => {
        const row = lineRow(line);
        return (
          <li
            key={line.id}
            className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-4"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className={cn("break-words text-lg font-semibold leading-snug text-foreground", struck && "text-faint-foreground")}>
                {row.description}
              </p>
              {row.serial ? (
                <p className="text-sm text-muted-foreground">
                  Serial <span className="rf-id break-all font-medium text-foreground">{row.serial}</span>
                </p>
              ) : null}
              <p className="rf-num flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
                <span className="tabular-nums">{row.qtyLine}</span>
                <span aria-hidden>·</span>
                <span>{row.tax}</span>
              </p>
            </div>
            <p
              className={cn(
                "rf-num shrink-0 text-xl font-semibold leading-snug tabular-nums text-foreground",
                struck && "text-faint-foreground line-through",
              )}
            >
              {formatCents(row.amountCents)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------- totals --- */

export interface TotalRow {
  label: string;
  value: string;
  /** "large" is the Total; the rest are quiet. */
  size?: "normal" | "large";
  tone?: "alert" | "good" | "muted";
  struck?: boolean;
  /** A rule above this row, to set it off from the ones before. */
  divider?: boolean;
}

/**
 * The receipt block: label left, amount right, large. Subtotal and Tax with
 * its rate, then the Total; what has been paid and refunded and the balance go
 * under a rule when the page passes them.
 */
export function TotalsBlock({ rows, className }: { rows: ReadonlyArray<TotalRow>; className?: string }) {
  return (
    <dl className={cn("ml-auto flex w-full max-w-md flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4", className)}>
      {rows.map((row) => (
        <div
          key={`${row.label}|${row.value}`}
          className={cn(
            "flex items-baseline justify-between gap-4",
            row.divider && "border-t border-border pt-3",
          )}
        >
          <dt className={cn("text-base", row.size === "large" ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {row.label}
          </dt>
          <dd
            className={cn(
              "rf-num text-right font-semibold tabular-nums",
              row.size === "large" ? "text-[28px] leading-none tracking-tight" : "text-lg",
              row.tone === "alert" && "text-status-overdue-fg",
              row.tone === "good" && "text-status-resolved-fg",
              row.tone === "muted" && "text-muted-foreground",
              !row.tone && "text-foreground",
              row.struck && "text-faint-foreground line-through",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------------- payments --- */

export interface MoneyRowData {
  id: string;
  kind: "payment" | "refund";
  /** The method in words: "Card (online)", "Cash", "Refund to Store credit". */
  title: string;
  /** "Oct 2, 2026, 4:15 PM · taken by Dana". */
  detail: string;
  /** The Stripe id or approval code, as a copyable node. */
  reference?: React.ReactNode;
  /** A sentence under the row (a refund's reason). */
  note?: string | null;
  /** A status word beside the title (a refund waiting on Stripe). */
  badge?: React.ReactNode;
  amountCents: number;
  /** A refund that did not go through: the amount stays visible but struck. */
  failed?: boolean;
}

/**
 * Payments, or refunds, as a list of rows: the method in words, when and who,
 * the amount on the right. A refund is signed and red, so money leaving can
 * never be mistaken for money collected. `footer` is where the page puts the
 * Refund button, so it sits right under the payments it would give back.
 */
export function MoneyRows({
  rows,
  footer,
  empty,
}: {
  rows: ReadonlyArray<MoneyRowData>;
  footer?: React.ReactNode;
  empty?: string;
}) {
  if (rows.length === 0) {
    return empty ? (
      <p className="rounded-2xl border border-dashed border-border-strong p-4 text-base text-muted-foreground">{empty}</p>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-foreground"
            >
              {row.kind === "refund" ? <Undo2 className="size-5" /> : <CreditCard className="size-5" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="break-words text-lg font-semibold leading-snug text-foreground">{row.title}</p>
                {row.badge}
              </div>
              <p className="text-sm text-muted-foreground">{row.detail}</p>
              {row.note ? <p className="text-sm leading-snug text-muted-foreground">{row.note}</p> : null}
              {row.reference ? <div className="min-w-0 max-w-full pt-0.5">{row.reference}</div> : null}
            </div>
            <p
              className={cn(
                "rf-num shrink-0 text-xl font-semibold leading-snug tabular-nums",
                row.kind === "refund" ? "text-destructive" : "text-status-resolved-fg",
                row.failed && "line-through opacity-60",
              )}
            >
              {row.kind === "refund" ? "−" : ""}
              {formatCents(row.amountCents)}
            </p>
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}

/* --------------------------------------------------------------- activity --- */

const ACTIVITY_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  created: FilePlus2,
  email: Mail,
  sms: MessageSquareText,
  payment: CreditCard,
  refund: Undo2,
  paid: CheckCircle2,
  approved: CircleCheck,
  converted: ArrowRightLeft,
};

/** The feed, newest first: an icon, the sentence, when, and what came of it in words. */
export function ActivityList({
  items,
  empty,
  zone,
}: {
  items: ReadonlyArray<ActivityItem>;
  empty?: string;
  /** The shop's time zone: each "when" is the shop's clock, not the server's. */
  zone?: string | null;
}) {
  if (items.length === 0) {
    return empty ? <p className="text-base text-muted-foreground">{empty}</p> : null;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const Icon = ACTIVITY_ICON[item.kind];
        return (
          <li key={item.key} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-foreground">
              <Icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="break-words text-base font-semibold leading-snug text-foreground">{item.title}</p>
              {item.detail ? <p className="break-words text-sm leading-snug text-muted-foreground">{item.detail}</p> : null}
              <p className="text-sm text-muted-foreground">
                {formatDateTime(item.at, zone)}
                {item.outcome ? (
                  <>
                    {" · "}
                    <span className={cn("font-semibold", item.alert ? "text-status-overdue-fg" : "text-foreground")}>
                      {item.outcome}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            {item.amount ? (
              <p className="rf-num shrink-0 text-lg font-semibold tabular-nums text-foreground">{item.amount}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ facts --- */

export interface Fact {
  label: string;
  value: React.ReactNode;
}

/** Label/value pairs in one calm box, not boxes inside boxes. */
export function FactList({ facts, className }: { facts: ReadonlyArray<Fact>; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2", className)}>
      {facts.map((fact) => (
        <div key={fact.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-[12px] font-medium uppercase tracking-[0.04em] text-faint-foreground">{fact.label}</dt>
          <dd className="min-w-0 break-words text-base font-medium text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A nothing-yet box that points at the next step, for a bill or a quote with no lines. */
export function EmptyLines({
  title,
  hint,
  action,
  icon = "invoice",
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
  icon?: "invoice" | "estimate";
}) {
  const Icon = icon === "invoice" ? Receipt : FileText;
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center">
      <Icon aria-hidden className="size-8 text-faint-foreground" />
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="text-base leading-snug text-muted-foreground">{hint}</p>
      </div>
      {action}
    </div>
  );
}
