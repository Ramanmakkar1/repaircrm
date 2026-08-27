import Link from "next/link";
import { startOfDay, endOfDay, startOfMonth } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Receipt,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { STATUS_META, normalizeStatus } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { TicketCard } from "@/components/tickets/ticket-card";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";

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

  const [statusGroups, dueToday, monthPayments, unpaidCandidates, recentTickets] =
    await Promise.all([
      db.ticket.groupBy({
        by: ["status"],
        where: { shopId },
        _count: { _all: true },
      }),
      db.ticket.count({
        where: {
          shopId,
          status: { not: "Resolved" },
          dueDate: { gte: startOfDay(now), lte: endOfDay(now) },
        },
      }),
      db.payment.aggregate({
        where: { shopId, createdAt: { gte: startOfMonth(now) } },
        _sum: { amountCents: true },
      }),
      db.invoice.findMany({
        where: { shopId, status: { in: ["SENT", "PARTIAL"] } },
        include: { lines: true, payments: true },
      }),
      db.ticket.findMany({
        where: { shopId },
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: {
          customer: true,
          assignedTo: true,
          asset: { select: { type: true, make: true, model: true } },
        },
      }),
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

  const stats: {
    label: string;
    value: string;
    hint: string;
    href: string;
    icon: LucideIcon;
    tint: string;
  }[] = [
    {
      label: "Open Tickets",
      value: String(openTickets),
      hint: "on the bench right now",
      href: "/tickets",
      icon: Wrench,
      tint: "bg-status-new-bg text-status-new-fg",
    },
    {
      label: "Due Today",
      value: String(dueToday),
      hint: "promised back today",
      href: "/tickets?sort=due",
      icon: CalendarClock,
      tint: "bg-status-in-progress-bg text-status-in-progress-fg",
    },
    {
      label: "Unpaid Invoices",
      value: String(unpaidCandidates.length),
      hint: `${formatCents(unpaidBalanceCents)} outstanding`,
      href: "/invoices?status=SENT",
      icon: Receipt,
      tint: "bg-status-overdue-bg text-status-overdue-fg",
    },
    {
      label: "This Month",
      value: formatCents(monthPayments._sum.amountCents ?? 0),
      hint: "collected so far",
      href: "/invoices",
      icon: CircleDollarSign,
      tint: "bg-status-resolved-bg text-status-resolved-fg",
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
              <Wrench />
              New Ticket
            </Link>
          </Button>
        }
      />

      {/* The four numbers that answer "how is today going?" */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rf-lift flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              className={cn(
                "flex size-12 items-center justify-center rounded-md",
                stat.tint,
              )}
            >
              <stat.icon className="size-6" strokeWidth={2.25} />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[34px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                {stat.value}
              </span>
              <span className="text-[15px] font-bold text-foreground">
                {stat.label}
              </span>
              <span className="text-[13px] text-muted-foreground">{stat.hint}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Where the work stands, as six colour-coded boxes. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Where the work stands</CardTitle>
          <Link
            href="/tickets?status=all"
            className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent hover:underline"
          >
            All tickets
            <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
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
            className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent hover:underline"
          >
            View all
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {recentTickets.length === 0 ? (
          <Card>
            <EmptyState
              icon={Wrench}
              title="No tickets yet"
              hint="New repair tickets will show up here as they come in."
              action={
                <Button asChild>
                  <Link href="/tickets/new">Create the first ticket</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} now={clock} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
