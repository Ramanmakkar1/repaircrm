import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { IconChip } from "@/components/ui/chip";
import { ICONS } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { calcTotals, formatCents, invoiceTotals } from "@/lib/money";
import { EM_DASH, formatDate, formatDateTime, humanizeEnum, preview } from "./format";
import { RowLink } from "@/components/list/row-link";
import { SectionCard } from "./section-card";
import { EstimateStatus, InvoiceStatus, TicketStatus } from "./status-pill";

type Line = { quantity: number; unitPriceCents: number; taxable: boolean };

/**
 * WHY THESE TABLES SIT IN A ONE-COLUMN GRID.
 *
 * The customer hub used to scroll sideways below about 530px, and the cause was
 * not the page — it was these cards. `Table` already wraps itself in an
 * `overflow-x-auto` scroller, but a scroll container in ordinary block flow
 * still hands its contents' min-content width up to whatever is sizing it. The
 * hub's grid is a single auto-sized column under `lg`, so a table whose columns
 * could not add up to less than 528px made the column 528px wide and the shell
 * scrolled. The scroller was there and never got the chance to scroll.
 *
 * A grid track of `minmax(0, 1fr)` is the fix: the floor is 0 rather than
 * min-content, so the card stops widening the page and the table scrolls inside
 * its own frame instead — which is what it was built to do. Nothing is hidden
 * and nothing is clipped.
 *
 * The cells below also stop being wider than they need to be (see the notes on
 * the payment method and the communication preview), so the scroller is a last
 * resort rather than the normal state of a phone-width hub.
 */
function TableFrame({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)]">{children}</div>;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export type TicketRow = {
  id: string;
  number: number;
  subject: string;
  status: string;
  createdAt: Date;
};

export function TicketsCard({
  customerId,
  tickets,
  total,
}: {
  customerId: string;
  tickets: TicketRow[];
  total: number;
}) {
  return (
    <SectionCard
      icon={ICONS.ticket}
      title="Tickets"
      count={total}
      viewAllHref={`/tickets?customerId=${customerId}`}
      empty="No tickets for this customer yet."
    >
      {tickets.length > 0 ? (
        <TableFrame>
          <Table>
            <THead>
              <tr>
                <Th className="w-16">#</Th>
                <Th>Subject</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell text-right">Opened</Th>
              </tr>
            </THead>
            <TBody>
              {tickets.map((ticket) => (
                <RowLink key={ticket.id} href={`/tickets/${ticket.id}`}>
                  <Td className="font-semibold tabular-nums text-muted-foreground">
                    {ticket.number}
                  </Td>
                  {/* 13rem, not 18: this table lives in the hub's right
                      column, and a wider subject pushed the status and date
                      columns into a horizontal scroll. */}
                  <Td className="max-w-[13rem]">
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="block truncate font-semibold text-foreground hover:text-accent hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                  </Td>
                  <Td>
                    <TicketStatus status={ticket.status} />
                  </Td>
                  <Td className="hidden text-right text-muted-foreground sm:table-cell">
                    {formatDate(ticket.createdAt)}
                  </Td>
                </RowLink>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      ) : undefined}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceRow = {
  id: string;
  number: number;
  status: string;
  taxRateBps: number;
  createdAt: Date;
  lines: Line[];
  payments: { amountCents: number }[];
};

export function InvoicesCard({
  customerId,
  invoices,
  total,
}: {
  customerId: string;
  invoices: InvoiceRow[];
  total: number;
}) {
  return (
    <SectionCard
      icon={ICONS.invoice}
      title="Invoices"
      count={total}
      viewAllHref={`/invoices?customerId=${customerId}`}
      empty="No invoices raised yet."
    >
      {invoices.length > 0 ? (
        <TableFrame>
          <Table>
            <THead>
              <tr>
                <Th className="w-16">#</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
                <Th className="hidden sm:table-cell text-right">Date</Th>
              </tr>
            </THead>
            <TBody>
              {invoices.map((invoice) => {
                const { totalCents, balanceCents } = invoiceTotals(
                  invoice.lines,
                  invoice.taxRateBps,
                  invoice.payments,
                );
                const owing = invoice.status !== "VOID" && balanceCents > 0;

                return (
                  <RowLink key={invoice.id} href={`/invoices/${invoice.id}`}>
                    <Td>
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="font-semibold tabular-nums text-foreground hover:text-accent hover:underline"
                      >
                        {invoice.number}
                      </Link>
                    </Td>
                    <Td>
                      <InvoiceStatus status={invoice.status} />
                    </Td>
                    <Td className="text-right tabular-nums text-muted-foreground">
                      {formatCents(totalCents)}
                    </Td>
                    <Td
                      className={cn(
                        "text-right tabular-nums",
                        owing ? "font-bold text-destructive" : "text-faint-foreground",
                      )}
                    >
                      {owing ? formatCents(balanceCents) : EM_DASH}
                    </Td>
                    <Td className="hidden text-right text-muted-foreground sm:table-cell">
                      {formatDate(invoice.createdAt)}
                    </Td>
                  </RowLink>
                );
              })}
            </TBody>
          </Table>
        </TableFrame>
      ) : undefined}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

export type EstimateRow = {
  id: string;
  number: number;
  status: string;
  taxRateBps: number;
  createdAt: Date;
  lines: Line[];
};

export function EstimatesCard({
  customerId,
  estimates,
  total,
}: {
  customerId: string;
  estimates: EstimateRow[];
  total: number;
}) {
  return (
    <SectionCard
      icon={ICONS.estimate}
      title="Estimates"
      count={total}
      viewAllHref={`/estimates?customerId=${customerId}`}
      empty="No estimates written yet."
    >
      {estimates.length > 0 ? (
        <TableFrame>
          <Table>
            <THead>
              <tr>
                <Th className="w-16">#</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="hidden sm:table-cell text-right">Date</Th>
              </tr>
            </THead>
            <TBody>
              {estimates.map((estimate) => {
                const { totalCents } = calcTotals(estimate.lines, estimate.taxRateBps);
                return (
                  <RowLink key={estimate.id} href={`/estimates/${estimate.id}`}>
                    <Td>
                      <Link
                        href={`/estimates/${estimate.id}`}
                        className="font-semibold tabular-nums text-foreground hover:text-accent hover:underline"
                      >
                        {estimate.number}
                      </Link>
                    </Td>
                    <Td>
                      <EstimateStatus status={estimate.status} />
                    </Td>
                    <Td className="text-right tabular-nums text-muted-foreground">
                      {formatCents(totalCents)}
                    </Td>
                    <Td className="hidden text-right text-muted-foreground sm:table-cell">
                      {formatDate(estimate.createdAt)}
                    </Td>
                  </RowLink>
                );
              })}
            </TBody>
          </Table>
        </TableFrame>
      ) : undefined}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentRow = {
  id: string;
  amountCents: number;
  method: string;
  reference: string | null;
  createdAt: Date;
  invoice: { id: string; number: number };
};

export function PaymentsCard({
  payments,
  total,
}: {
  payments: PaymentRow[];
  total: number;
}) {
  return (
    <SectionCard
      icon={ICONS.payment}
      title="Payments"
      count={total}
      empty="No payments taken yet."
    >
      {payments.length > 0 ? (
        <TableFrame>
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Invoice</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </THead>
            <TBody>
              {payments.map((payment) => (
                <RowLink key={payment.id} href={`/invoices/${payment.invoice.id}`}>
                  {/* `Td` is nowrap by default, which is right for a figure and
                      wrong for these two: "Sep 8, 2026" and "Store credit" were
                      each contributing their whole width to a table that had
                      four such columns. Wrapping costs nothing at any width
                      that fits and is the difference between a hub that fits a
                      phone and one that does not. */}
                  <Td className="whitespace-normal text-muted-foreground">
                    {formatDate(payment.createdAt)}
                  </Td>
                  <Td className="whitespace-normal font-medium text-foreground">
                    {humanizeEnum(payment.method)}
                    {/* A reference is an opaque token — a Stripe id, a cheque
                        number — with no space in it to break at, so it is the
                        one string here that can be arbitrarily wide. Allowed to
                        break mid-token rather than truncated: staff read these
                        out loud to banks and customers, and half a reference is
                        no use to anyone. */}
                    {payment.reference ? (
                      <span className="ml-2 break-all font-mono text-[12.5px] font-normal text-faint-foreground">
                        {payment.reference}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Link
                      href={`/invoices/${payment.invoice.id}`}
                      className="tabular-nums text-muted-foreground hover:text-accent hover:underline"
                    >
                      #{payment.invoice.number}
                    </Link>
                  </Td>
                  <Td className="text-right font-bold tabular-nums text-status-resolved-fg">
                    {formatCents(payment.amountCents)}
                  </Td>
                </RowLink>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      ) : undefined}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Communication log
// ---------------------------------------------------------------------------

export type CommunicationRow = {
  id: string;
  type: string;
  direction: string;
  to: string;
  subject: string | null;
  body: string;
  createdAt: Date;
};

export function CommunicationsCard({
  entries,
  total,
}: {
  entries: CommunicationRow[];
  total: number;
}) {
  return (
    <SectionCard
      icon={ICONS.email}
      title="Communication"
      count={total}
      empty="Nothing sent to this customer yet."
    >
      {entries.length > 0 ? (
        <ul className="divide-y divide-border">
          {entries.map((entry) => {
            const outbound = entry.direction === "OUT";
            const TypeIcon = entry.type === "SMS" ? ICONS.message : ICONS.email;
            const DirectionIcon = outbound ? ArrowUpRight : ArrowDownLeft;

            return (
              <li key={entry.id} className="flex items-start gap-3.5 px-5 py-4">
                <IconChip
                  icon={TypeIcon}
                  size="sm"
                  className={cn(
                    entry.type === "SMS"
                      ? "bg-status-ready-bg text-status-ready-fg"
                      : "bg-status-new-bg text-status-new-fg",
                  )}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* min-w-0, or the truncating subject beside the arrow cannot
                      actually shrink and the row sets the card's width. */}
                  <div className="flex min-w-0 items-center gap-2">
                    <DirectionIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        outbound ? "text-faint-foreground" : "text-status-ready",
                      )}
                    />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {entry.subject || `${entry.type === "SMS" ? "SMS" : "Email"} to ${entry.to}`}
                    </span>
                  </div>
                  {/* `break-words`, because these bodies are emails and texts
                      and the longest thing in one is nearly always an unbroken
                      portal URL. Two lines of clamp cannot help with that: a
                      word with no break opportunity sets the paragraph's
                      minimum width, and through it the card's. */}
                  <p className="line-clamp-2 break-words text-[13.5px] leading-relaxed text-muted-foreground">
                    {preview(entry.body, 160)}
                  </p>
                  <span className="text-[13px] text-faint-foreground">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : undefined}
    </SectionCard>
  );
}
