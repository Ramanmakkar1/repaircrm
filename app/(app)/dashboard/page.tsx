import type { Metadata } from "next";
import Link from "next/link";
import { startOfDay, endOfDay, startOfMonth } from "date-fns";
// AlarmClock is the one glyph here with no concept in components/ui/icons.ts.
import { AlarmClock, type LucideIcon } from "lucide-react";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  StatBand,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { STATUS_META, normalizeStatus, type StatusTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { RowLink } from "@/components/list/row-link";
import { customerLabel, relativeShort } from "@/components/tickets/ticket-meta";
import { StatusBadge } from "@/components/ui/badge";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { formatCents, invoiceTotals } from "@/lib/money";
import { needsReplyTicketIds } from "@/lib/needs-reply";
import { NEEDS_REPLY_FILTER } from "@/components/tickets/ticket-meta";

export const metadata: Metadata = { title: "Dashboard · RepairFlow" };

export const dynamic = "force-dynamic";

const TICKET_STATUSES = [
  "New",
  "In Progress",
  "Waiting for Parts",
  "Waiting on Customer",
  "Ready for Pickup",
  "Resolved",
] as const;

export default async function DashboardPage() {
  const { shopId } = await requireUser();
  const now = new Date();

  // Every tile and list below narrows to the branch on screen, when one is
  // selected. A single-location shop always resolves this to "all".
  const branch = await locationWhere();

  const [
    statusGroups,
    dueToday,
    overdueCount,
    monthPayments,
    unpaidCandidates,
    recentTickets,
    awaitingReply,
  ] = await Promise.all([
    db.ticket.groupBy({
      by: ["status"],
      where: { shopId, ...branch },
      _count: { _all: true },
    }),
    db.ticket.count({
      where: {
        shopId,
        ...branch,
        status: { not: "Resolved" },
        dueDate: { gte: startOfDay(now), lte: endOfDay(now) },
      },
    }),
    db.ticket.count({
      where: {
        shopId,
        ...branch,
        status: { not: "Resolved" },
        dueDate: { lt: now },
      },
    }),
    db.payment.aggregate({
      where: {
        shopId,
        createdAt: { gte: startOfMonth(now) },
        ...(branch.locationId ? { invoice: { locationId: branch.locationId } } : {}),
      },
      _sum: { amountCents: true },
    }),
    db.invoice.findMany({
      where: { shopId, ...branch, status: { in: ["SENT", "PARTIAL"] } },
      include: { lines: true, payments: true },
    }),
    db.ticket.findMany({
      where: { shopId, ...branch },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        customer: true,
        assignedTo: true,
        asset: { select: { type: true, make: true, model: true } },
      },
    }),
    // Customers who wrote in and have not been answered — see
    // lib/needs-reply.ts for what "answered" means.
    needsReplyTicketIds(shopId),
  ]);

  const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count._all]));
  const openTickets = statusGroups
    .filter((g) => g.status !== "Resolved")
    .reduce((sum, g) => sum + g._count._all, 0);
  const unpaidBalanceCents = unpaidCandidates.reduce(
    (sum, inv) =>
      sum + invoiceTotals(inv.lines, inv.taxRateBps, inv.payments).balanceCents,
    0,
  );

  // One request-time clock so every card measures staleness against the same
  // instant. eslint-disable: react-hooks/purity targets Client Components.
  // eslint-disable-next-line react-hooks/purity
  const clock = Date.now();

  // Six tiles, one tone each, and the tone is the meaning: blue is the work in
  // hand, amber is due today, violet is blocked on a customer, red is late or
  // unpaid, green is money in.
  const stats: {
    label: string;
    value: string;
    hint: string;
    href: string;
    icon: LucideIcon;
    tone: StatusTone;
  }[] = [
    {
      label: "Open Tickets",
      value: String(openTickets),
      hint: "on the bench right now",
      href: "/tickets",
      icon: ICONS.ticket,
      tone: "info",
    },
    {
      label: "Due Today",
      value: String(dueToday),
      hint: "promised back today",
      href: "/tickets?due=today",
      icon: ICONS.dueDate,
      tone: "active",
    },
    {
      label: "Overdue",
      value: String(overdueCount),
      hint: overdueCount === 0 ? "nothing past its date" : "past their promised date",
      href: "/tickets?due=overdue",
      icon: AlarmClock,
      tone: "danger",
    },
    {
      label: "Customer Replies",
      value: String(awaitingReply.length),
      hint: "waiting on an answer",
      href: `/tickets?status=${NEEDS_REPLY_FILTER}`,
      icon: ICONS.message,
      tone: "waiting",
    },
    {
      label: "Unpaid Invoices",
      value: String(unpaidCandidates.length),
      hint: `${formatCents(unpaidBalanceCents)} outstanding`,
      href: "/invoices?status=SENT",
      icon: ICONS.invoice,
      tone: "danger",
    },
    {
      label: "This Month",
      value: formatCents(monthPayments._sum.amountCents ?? 0),
      hint: "collected so far",
      href: "/invoices",
      icon: ICONS.cash,
      tone: "success",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="A quick look at what's happening in your shop."
        actions={
          <Button asChild>
            <Link href="/tickets/new">
              <ACTIONS.add />
              New Ticket
            </Link>
          </Button>
        }
      />

      {/* Renders nothing once the shop is set up, or once it is dismissed. */}
      <SetupChecklist />

      {/*
        The six numbers that answer "how is today going?".

        One summary band, not six floating boxes. Six separate bordered cards
        with gaps between them made the top of the shop's home screen read as
        six unrelated things; they are one reading of one moment, so they share
        one container and are separated by hairlines — the band Stripe puts
        across the top of Payments and Balance. Same six links, same six
        numbers, roughly half the vertical space.
      */}
      <StatBand
        items={stats.map((stat) => ({
          label: stat.label,
          value: stat.value,
          hint: stat.hint,
          tone: stat.tone,
          href: stat.href,
        }))}
      />

      {/* Where the work stands: six counts on one hairline grid. */}
      <Card>
        <CardHeader
          icon={ICONS.ticket}
          title="Where the work stands"
          action={
            <Link
              href="/tickets?status=all"
              className="inline-flex items-center gap-1 rounded-sm text-[13.5px] font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              All tickets
              <ACTIONS.next className="size-4" />
            </Link>
          }
        />
        <CardContent className="px-0 py-0">
          {/*
            Six saturated colour blocks used to live here, and on a gray canvas
            they were the loudest thing on the shop's home screen — six equal
            shouts, which is the same as none. The colour is now carried by a
            7px dot, the count is plain foreground ink at a size you can read
            across the counter, and the hairline grid (gap-px over a border
            fill) is what separates them. Same six links, same six numbers.
          */}
          <div className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-6">
            {TICKET_STATUSES.map((status) => {
              const meta = STATUS_META[normalizeStatus(status)];
              const count = statusCounts.get(status) ?? 0;
              return (
                <Link
                  key={status}
                  href={`/tickets?status=${encodeURIComponent(status)}`}
                  className="flex flex-col gap-2 bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
                    <span
                      aria-hidden
                      className={cn("size-[7px] shrink-0 rounded-full", meta.dot)}
                    />
                    <span className="truncate">{status}</span>
                  </span>
                  <span className="rf-num text-[26px] font-semibold leading-none text-foreground">
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity, as the same cards used on the tickets board. */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
            Recently touched
          </h2>
          <Link
            href="/tickets"
            className="inline-flex items-center gap-1 rounded-sm text-[13.5px] font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            View all
            <ACTIONS.next className="size-4" />
          </Link>
        </div>

        {recentTickets.length === 0 ? (
          <Card>
            <EmptyState
              icon={ICONS.ticket}
              title="No tickets yet"
              hint="New repair tickets will show up here as they come in."
              action={
                <Button asChild>
                  <Link href="/tickets/new">
                    <ACTIONS.add />
                    New Ticket
                  </Link>
                </Button>
              }
            />
          </Card>
        ) : (
          /*
            Nine tickets as a table, not nine cards.
            ----------------------------------------
            The card grid put three tickets on a row, each in its own box with
            a 3px coloured stripe down the side, and pushed everything below it
            off the screen. Nine of anything shouting at once is nine things
            you skip. As rows they are scannable in one pass — number, who,
            what, state, when — which is the actual question this block answers
            ("what has the shop been touching?"), and the same nine tickets now
            take about a third of the height.

            `TicketCard` is untouched and still correct where a card is the
            right object: the kanban board.
          */
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <Tr>
                  <Th>Ticket</Th>
                  <Th>Customer</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Updated</Th>
                </Tr>
              </THead>
              <TBody>
                {recentTickets.map((ticket) => (
                  <RowLink key={ticket.id} href={`/tickets/${ticket.id}`}>
                    <Td>
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="rf-id font-semibold text-accent-soft-foreground hover:underline"
                      >
                        #{ticket.number}
                      </Link>
                    </Td>
                    <Td className="font-medium text-foreground">
                      <span className="block max-w-[180px] truncate">
                        {customerLabel(ticket.customer)}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className="block max-w-[380px] truncate"
                        title={ticket.subject}
                      >
                        {ticket.subject}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={ticket.status} />
                    </Td>
                    <Td className="text-right text-muted-foreground">
                      {relativeShort(ticket.updatedAt, clock)}
                    </Td>
                  </RowLink>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
