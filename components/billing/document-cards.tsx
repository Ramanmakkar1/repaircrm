import * as React from "react";
import { AlertCircle, FileText, Receipt, Repeat } from "lucide-react";

import { formatCents } from "@/lib/money";
import { StatusPill, type StatusTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { IconVisual, MetaChip, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { EstimateStatusBadge, InvoiceStatusBadge } from "./status-badge";
import {
  autoLabel,
  estimateCardLine,
  estimateMoneyLine,
  invoiceCardLine,
  invoiceMoneyLine,
  invoicesSoFar,
  overdueLabel,
  scheduleCardLine,
  type CardLine,
  type MoneyLine,
  type MoneyTone,
} from "./record-format";

/**
 * The Easy-mode cards for the Invoices, Estimates and Recurring lists. They are
 * built from the shared `RecordCard`, so a bill reads like a repair or a
 * customer two screens over:
 *
 *   [ icon ]  #1014 - Okonkwo Dental Group                      $450.00
 *             Raised Sep 18 - due Oct 2                         $450.00 due
 *             (Sent) (1 day overdue)
 *
 * Two small departures from the kit's default slots, both for the same reason.
 * The status badge sits in the chip row instead of beside the title: the money
 * column on the right is already the widest thing on the card, and on a phone
 * a badge next to the title left it about four letters. The title also wraps to
 * two lines rather than truncating, so a long business name is never cut off
 * at the one moment you are checking whose bill this is.
 *
 * Plain data in, no database, no hooks: the page decides what to load and the
 * sentences come from `record-format.ts`, which is unit-tested.
 */

/**
 * The grid for these three lists. The kit's `RecordGrid` goes to two columns at
 * 768px, which on a portrait tablet makes each of these cards about 345px wide:
 * after the picture and the money column that leaves ~140px for the name, and
 * "Okonkwo Dental Group" was cut off. These cards carry more than a Repairs
 * card does (money column, two-line title), so they stay one column until `lg`
 * (1024px, where each is ~475px) and use three only on a very wide screen.
 */
export const DOCUMENT_GRID_CLASS = "md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3";

export function DocumentGrid({ children }: { children: React.ReactNode }) {
  return <RecordGrid className={DOCUMENT_GRID_CLASS}>{children}</RecordGrid>;
}

const MONEY_TONE: Record<MoneyTone, string> = {
  owed: "text-foreground",
  overdue: "text-status-overdue-fg",
  paid: "text-status-resolved-fg",
  muted: "text-muted-foreground",
};

/**
 * On a phone the money moves into the chip row (see `MoneyRow`), so the
 * right-hand slot the kit renders is hidden outright. Hiding only its content
 * would leave an empty flex item behind, and its gap would still cost 16px.
 */
const PHONE_NO_TRAILING = "max-sm:[&>span:last-child]:hidden";

/** A title that wraps to two lines instead of truncating (RecordCard truncates one line). */
function Title({ children }: { children: React.ReactNode }) {
  return <span className="line-clamp-2 whitespace-normal break-words">{children}</span>;
}

/** "Raised Sep 18 - due Oct 2", the due part emphasised in the alert colour once it is late. */
function Line({ line, prefix }: { line: CardLine; prefix?: React.ReactNode }) {
  return (
    <>
      {prefix}
      {line.lead}
      {line.tail ? (
        <>
          {/* A non-breaking space keeps the dot with the word before it when the line wraps. */}
          {"\u00A0· "}
          <span className={cn(line.late && "font-semibold text-status-overdue-fg")}>{line.tail}</span>
        </>
      ) : null}
    </>
  );
}

/**
 * The money: the total in large tabular figures, then one plain-words line.
 *
 * It is drawn twice and CSS shows one. From a tablet up it is the right-hand
 * column, as on every other list. On a phone there is no room for a column
 * (it left the title four letters) so the same figures sit in a row under the
 * chips instead. `display: none` removes the hidden copy from the page for
 * screen readers too, so nobody hears the amount twice.
 */
function MoneyColumn({ cents, line, struck }: { cents: number; line: MoneyLine; struck?: boolean }) {
  return (
    <span className="hidden h-full min-w-20 flex-col items-end justify-center gap-0.5 text-right sm:flex">
      <Total cents={cents} struck={struck} />
      <MoneyWords line={line} />
    </span>
  );
}

function MoneyRow({ cents, line, struck }: { cents: number; line: MoneyLine; struck?: boolean }) {
  return (
    <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3 pt-1 sm:hidden">
      <Total cents={cents} struck={struck} />
      <MoneyWords line={line} />
    </span>
  );
}

function Total({ cents, struck }: { cents: number; struck?: boolean }) {
  return (
    <span
      className={cn(
        "rf-num text-xl font-semibold leading-tight tabular-nums",
        struck ? "text-faint-foreground line-through" : "text-foreground",
      )}
    >
      {formatCents(cents)}
    </span>
  );
}

function MoneyWords({ line }: { line: MoneyLine }) {
  if (!line.text) return null;
  return <span className={cn("rf-num text-sm font-semibold leading-tight", MONEY_TONE[line.tone])}>{line.text}</span>;
}

export interface InvoiceCardData {
  id: string;
  number: number;
  customerName: string;
  status: string;
  createdAt: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  totalCents: number;
  /** Refund-aware, from `refundAwareTotals`. */
  balanceCents: number;
}

export function InvoiceCard({ invoice, now }: { invoice: InvoiceCardData; now: number }) {
  const late = overdueLabel(invoice.dueDate, invoice.balanceCents, now);
  const overdue = invoice.status !== "VOID" && late !== null;
  const line = invoiceCardLine(invoice, now);
  const money = invoiceMoneyLine({ status: invoice.status, balanceCents: invoice.balanceCents, overdue });

  return (
    <RecordCard
      href={`/invoices/${invoice.id}`}
      className={cn("h-full", PHONE_NO_TRAILING, overdue && "border-status-overdue/50")}
      visual={<IconVisual icon={Receipt} />}
      title={
        <Title>
          <span className={cn(invoice.status === "VOID" && "text-faint-foreground line-through")}>
            #{invoice.number} · {invoice.customerName}
          </span>
        </Title>
      }
      subtitle={<Line line={line} />}
      meta={
        <>
          <InvoiceStatusBadge status={invoice.status} size="md" />
          {overdue ? (
            <MetaChip tone="alert" icon={AlertCircle}>
              {late}
            </MetaChip>
          ) : null}
          <MoneyRow cents={invoice.totalCents} line={money} struck={invoice.status === "VOID"} />
        </>
      }
      trailing={<MoneyColumn cents={invoice.totalCents} line={money} struck={invoice.status === "VOID"} />}
    />
  );
}

export interface EstimateCardData {
  id: string;
  number: number;
  customerName: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  approvedAt: Date | null;
  totalCents: number;
}

export function EstimateCard({ estimate, now }: { estimate: EstimateCardData; now: number }) {
  const line = estimateCardLine(estimate, now);
  const money = estimateMoneyLine(estimate.status);

  return (
    <RecordCard
      href={`/estimates/${estimate.id}`}
      className={cn("h-full", PHONE_NO_TRAILING, line.late && "border-status-overdue/50")}
      visual={<IconVisual icon={FileText} />}
      title={
        <Title>
          #{estimate.number} · {estimate.customerName}
        </Title>
      }
      subtitle={<Line line={line} />}
      meta={
        <>
          <EstimateStatusBadge status={estimate.status} size="md" />
          {line.late ? (
            <MetaChip tone="alert" icon={AlertCircle}>
              Quote expired
            </MetaChip>
          ) : null}
          <MoneyRow cents={estimate.totalCents} line={money} />
        </>
      }
      trailing={<MoneyColumn cents={estimate.totalCents} line={money} />}
    />
  );
}

const EACH_TIME: MoneyLine = { text: "each time", tone: "muted" };

export interface ScheduleCardData {
  id: string;
  name: string;
  customerName: string;
  cadence: string;
  nextRunAt: Date;
  active: boolean;
  due: boolean;
  autoSend: boolean;
  autoCharge: boolean;
  lastChargeError: string | null;
  invoiceCount: number;
  totalCents: number;
  state: { label: string; tone: StatusTone };
}

export function ScheduleCard({ schedule, now }: { schedule: ScheduleCardData; now: number }) {
  const line = scheduleCardLine(schedule, now);
  const auto = autoLabel(schedule.autoSend, schedule.autoCharge);

  return (
    <RecordCard
      href={`/invoices/recurring/${schedule.id}`}
      className={cn("h-full", PHONE_NO_TRAILING, schedule.lastChargeError && "border-status-overdue/50")}
      visual={<IconVisual icon={Repeat} />}
      title={<Title>{schedule.name}</Title>}
      subtitle={<Line line={line} prefix={`${schedule.customerName}\u00A0· `} />}
      meta={
        <>
          <StatusPill tone={schedule.state.tone} label={schedule.state.label} />
          {schedule.lastChargeError ? (
            <StatusPill tone="danger" label="Charge failed" title={schedule.lastChargeError} />
          ) : null}
          {auto ? <MetaChip>{auto}</MetaChip> : null}
          <MetaChip>{invoicesSoFar(schedule.invoiceCount)}</MetaChip>
          <MoneyRow cents={schedule.totalCents} line={EACH_TIME} />
        </>
      }
      trailing={<MoneyColumn cents={schedule.totalCents} line={EACH_TIME} />}
    />
  );
}
