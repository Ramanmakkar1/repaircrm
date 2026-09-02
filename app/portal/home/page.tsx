import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import {
  EstimateStatusBadge,
  InvoiceStatusBadge,
} from "@/components/billing/status-badge";
import { formatDate } from "@/components/billing/format";
import { db } from "@/lib/db";
import { calcTotals, formatCents, invoiceTotals } from "@/lib/money";
import { requirePortalCustomer } from "@/lib/portal-session";
import { EstimateDecision } from "../_components/estimate-decision";
import {
  PortalCard,
  PortalCardHeader,
  PortalShell,
} from "../_components/shell";

export const metadata = { title: "Your repairs · RepairFlow" };

// The same three glyphs the shop's own screens use for these records, so a
// customer who is also a walk-in never sees a repair drawn two ways.
const AddIcon = ACTIONS.add;
const TicketIcon = ICONS.ticket;
const EstimateIcon = ICONS.estimate;
const InvoiceIcon = ICONS.invoice;

/**
 * The customer's hub.
 *
 * EVERY query below filters on BOTH `customerId` and `shopId` from the portal
 * cookie. Not one of them takes an id from the URL — there is no URL to take one
 * from — so this page structurally cannot show another customer's work.
 *
 * `select` is used rather than `include` throughout, so internal fields
 * (diagnostic notes, device passwords, private comments, who it is assigned to)
 * never even enter the render, let alone the RSC payload.
 */
export default async function PortalHomePage() {
  const customer = await requirePortalCustomer("/portal/home");
  const scope = { customerId: customer.id, shopId: customer.shopId };

  const [tickets, estimates, invoices] = await Promise.all([
    db.ticket.findMany({
      where: scope,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        updatedAt: true,
        comments: {
          where: { isPublic: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, body: true, createdAt: true },
        },
      },
    }),
    db.estimate.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        taxRateBps: true,
        lines: {
          select: { quantity: true, unitPriceCents: true, taxable: true },
        },
      },
    }),
    db.invoice.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        dueDate: true,
        taxRateBps: true,
        lines: {
          select: { quantity: true, unitPriceCents: true, taxable: true },
        },
        payments: { select: { amountCents: true } },
      },
    }),
  ]);

  const openTickets = tickets.filter(
    (ticket) => ticket.status.toLowerCase() !== "resolved",
  ).length;

  const outstanding = invoices.reduce((sum, invoice) => {
    if (invoice.status === "VOID") return sum;
    const { balanceCents } = invoiceTotals(
      invoice.lines,
      invoice.taxRateBps,
      invoice.payments,
    );
    return sum + Math.max(balanceCents, 0);
  }, 0);

  const awaitingApproval = estimates.filter((e) => e.status === "SENT").length;

  return (
    <PortalShell
      shopName={customer.shop.name}
      customerName={`${customer.firstName} ${customer.lastName}`}
    >
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            Hi {customer.firstName} 👋
          </h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {summaryLine({ openTickets, awaitingApproval, outstanding })}
          </p>
        </div>
        <Link
          href="/portal/tickets/new"
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[14px] font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <AddIcon className="size-4" aria-hidden />
          New request
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {/* ------------------------------------------------------ repairs -- */}
        <PortalCard>
          <PortalCardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Chip>
                  <TicketIcon className="size-3.5" />
                </Chip>
                Your repairs
              </span>
            }
            description={
              tickets.length === 1 ? "1 repair" : `${tickets.length} repairs`
            }
          />
          {tickets.length === 0 ? (
            <EmptyState
              icon={TicketIcon}
              title="No repairs yet"
              hint={`A repair appears here the moment ${customer.shop.name} books your device in — or you can tell them what's wrong yourself.`}
              action={
                <Button asChild>
                  <Link href="/portal/tickets/new">
                    <AddIcon aria-hidden /> Start a repair request
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {tickets.map((ticket) => {
                const update = ticket.comments[0];
                return (
                  <li key={ticket.id}>
                    <Link
                      href={`/portal/tickets/${ticket.id}`}
                      className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-hover sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] text-muted-foreground">
                            #{ticket.number}
                          </span>
                          <StatusBadge status={ticket.status} />
                        </div>
                        <div className="mt-1 truncate text-[15px] font-semibold">
                          {ticket.subject}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                          {update
                            ? `${formatDate(update.createdAt)} — ${update.body}`
                            : "No updates from the shop yet."}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 size-5 shrink-0 text-faint-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </PortalCard>

        {/* ---------------------------------------------------- estimates -- */}
        <PortalCard>
          <PortalCardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Chip>
                  <EstimateIcon className="size-3.5" />
                </Chip>
                Estimates
              </span>
            }
            description={
              awaitingApproval > 0
                ? `${awaitingApproval} waiting for your go-ahead`
                : "Quotes for work before it starts"
            }
          />
          {estimates.length === 0 ? (
            <EmptyState
              icon={EstimateIcon}
              title="No estimates yet"
              hint="When the shop quotes for work before starting it, the quote lands here for you to approve or decline."
            />
          ) : (
            <ul className="divide-y divide-border">
              {estimates.map((estimate) => {
                const total = calcTotals(
                  estimate.lines,
                  estimate.taxRateBps,
                ).totalCents;
                return (
                  <li key={estimate.id} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/portal/estimates/${estimate.id}`}
                            className="text-[15px] font-semibold hover:underline"
                          >
                            Estimate #{estimate.number}
                          </Link>
                          <EstimateStatusBadge status={estimate.status} />
                        </div>
                        <div className="mt-1 text-[13px] text-muted-foreground">
                          {formatDate(estimate.createdAt)}
                        </div>
                      </div>
                      <div className="font-mono text-[17px] font-semibold">
                        {formatCents(total)}
                      </div>
                    </div>

                    {estimate.status === "SENT" ? (
                      <div className="mt-3.5">
                        <EstimateDecision estimateId={estimate.id} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </PortalCard>

        {/* ----------------------------------------------------- invoices -- */}
        <PortalCard>
          <PortalCardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Chip>
                  <InvoiceIcon className="size-3.5" />
                </Chip>
                Invoices
              </span>
            }
            description={
              outstanding > 0
                ? `${formatCents(outstanding)} outstanding`
                : "Nothing outstanding"
            }
          />
          {invoices.length === 0 ? (
            <EmptyState
              icon={InvoiceIcon}
              title="No invoices yet"
              hint="Bills for finished work show up here, with what's been paid and anything still outstanding."
            />
          ) : (
            <ul className="divide-y divide-border">
              {invoices.map((invoice) => {
                const totals = invoiceTotals(
                  invoice.lines,
                  invoice.taxRateBps,
                  invoice.payments,
                );
                return (
                  <li key={invoice.id}>
                    <Link
                      href={`/portal/invoices/${invoice.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-hover sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold">
                            Invoice #{invoice.number}
                          </span>
                          <InvoiceStatusBadge status={invoice.status} />
                        </div>
                        <div className="mt-1 text-[13px] text-muted-foreground">
                          {formatDate(invoice.createdAt)}
                          {invoice.dueDate
                            ? ` · due ${formatDate(invoice.dueDate)}`
                            : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[17px] font-semibold">
                          {formatCents(totals.totalCents)}
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {totals.balanceCents > 0
                            ? `${formatCents(totals.balanceCents)} due`
                            : "Paid in full"}
                        </div>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-faint-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </PortalCard>
      </div>
    </PortalShell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex size-7 items-center justify-center rounded-lg bg-chip-accent-bg text-chip-accent-fg">
      {children}
    </span>
  );
}

/** One friendly sentence instead of a wall of stat tiles. */
function summaryLine({
  openTickets,
  awaitingApproval,
  outstanding,
}: {
  openTickets: number;
  awaitingApproval: number;
  outstanding: number;
}): string {
  const parts: string[] = [];
  if (openTickets > 0) {
    parts.push(
      openTickets === 1 ? "1 repair in progress" : `${openTickets} repairs in progress`,
    );
  }
  if (awaitingApproval > 0) {
    parts.push(
      awaitingApproval === 1
        ? "1 estimate waiting on you"
        : `${awaitingApproval} estimates waiting on you`,
    );
  }
  if (outstanding > 0) parts.push(`${formatCents(outstanding)} outstanding`);

  if (parts.length === 0) return "You're all caught up — nothing needs your attention.";
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
}
