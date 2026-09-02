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
  StatTile,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { STATUS_META, normalizeStatus, type StatusTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { TicketCard } from "@/components/tickets/ticket-card";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { requireUser } from "@/lib/auth";
import { checklistProgress, parseChecklist } from "@/lib/checklist";
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
        icon={ICONS.dashboard}
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

      {/* The six numbers that answer "how is today going?" */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            // `StatTile` is a div, so the link wraps it and owns the focus
            // ring; the tile itself carries the shared interactive treatment.
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <StatTile
              interactive
              icon={stat.icon}
              tone={stat.tone}
              value={stat.value}
              label={stat.label}
              hint={stat.hint}
              className="h-full"
            />
          </Link>
        ))}
      </div>

      {/* Where the work stands, as six colour-coded boxes. */}
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
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TICKET_STATUSES.map((status) => {
              const meta = STATUS_META[normalizeStatus(status)];
              const count = statusCounts.get(status) ?? 0;
              return (
                <Link
                  key={status}
                  href={`/tickets?status=${encodeURIComponent(status)}`}
                  className={cn(
                    "rf-lift flex flex-col gap-1.5 rounded-md p-4 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    meta.bg,
                  )}
                >
                  <span
                    className={cn(
                      "text-3xl font-bold leading-none tabular-nums",
                      meta.fg,
                    )}
                  >
                    {count}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] font-bold leading-snug",
                      meta.fg,
                    )}
                  >
                    {status}
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
          <h2 className="text-xl font-bold tracking-tight text-foreground">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={{
                  ...ticket,
                  checklist: checklistProgress(parseChecklist(ticket.checklist)),
                }}
                now={clock}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
