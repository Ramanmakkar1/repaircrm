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

export const metadata: Metadata = { title: "Dashboard · RepairPilot" };

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
    needsReplyTicketIds(shopId, branch.locationId),
  ]);

  const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count._all]));
  const statusRows = TICKET_STATUSES.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
    meta: STATUS_META[normalizeStatus(status)],
  }));
  const totalTickets = statusRows.reduce((sum, row) => sum + row.count, 0);
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

  // Four headline measures keep the first screen easy to scan. Individual
  // overdue and ready-for-pickup queues stay visible in the attention panel.
  const stats: {
    label: string;
    value: string;
    hint: string;
    href: string;
    icon: LucideIcon;
    tone: StatusTone;
  }[] = [
    {
      label: "Open repairs",
      value: String(openTickets),
      hint: "active work orders",
      href: "/tickets",
      icon: ICONS.ticket,
      tone: "info",
    },
    {
      label: "Due today",
      value: String(dueToday),
      hint: "promised back today",
      href: "/tickets?due=today",
      icon: ICONS.dueDate,
      tone: "active",
    },
    {
      label: "Customer replies",
      value: String(awaitingReply.length),
      hint: "waiting on an answer",
      href: `/tickets?status=${NEEDS_REPLY_FILTER}`,
      icon: ICONS.message,
      tone: "waiting",
    },
    {
      label: "Outstanding balance",
      value: formatCents(unpaidBalanceCents),
      hint: unpaidCandidates.length + (unpaidCandidates.length === 1 ? " unpaid invoice" : " unpaid invoices"),
      href: "/invoices?status=SENT",
      icon: ICONS.invoice,
      tone: "danger",
    },
  ];

  const attentionRows = [
    {
      label: "Overdue repairs",
      hint: overdueCount === 0 ? "Everything is on schedule" : "Past the promised date",
      count: overdueCount,
      href: "/tickets?due=overdue",
      tone: "text-status-overdue-fg",
    },
    {
      label: "Customer replies",
      hint: "Waiting for your team",
      count: awaitingReply.length,
      href: "/tickets?status=" + NEEDS_REPLY_FILTER,
      tone: "text-status-waiting-fg",
    },
    {
      label: "Ready for pickup",
      hint: "Repairs finished and awaiting handoff",
      count: statusCounts.get("Ready for Pickup") ?? 0,
      href: "/tickets?status=Ready%20for%20Pickup",
      tone: "text-status-ready-fg",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Your repair pipeline, customer follow-ups and today's priorities."
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

      <Card className="grid gap-2 p-2 sm:grid-cols-3">
        <QuickAction
          href="/appointments?new=1"
          icon={ICONS.appointment}
          title="Book an appointment"
          hint="Schedule a drop-off or pickup"
        />
        <QuickAction
          href="/customers/new"
          icon={ICONS.customer}
          title="Add a customer"
          hint="Save their details for next time"
        />
        <QuickAction
          href="/pos"
          icon={ICONS.pos}
          title="Take a payment"
          hint="Open the counter register"
        />
      </Card>

      <StatBand
        columns={4}
        items={stats.map((stat) => ({
          label: stat.label,
          value: stat.value,
          hint: stat.hint,
          tone: stat.tone,
          href: stat.href,
          icon: stat.icon,
        }))}
      />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.8fr)] 2xl:items-start">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            icon={ICONS.ticket}
            title="Recent repairs"
            description="Latest ticket updates from this shop."
            action={
              <Link
                href="/tickets"
                className="inline-flex items-center gap-1 rounded-sm text-[13.5px] font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                View all
                <ACTIONS.next className="size-4" />
              </Link>
            }
          />
          {recentTickets.length === 0 ? (
            <CardContent className="px-0 py-0">
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
            </CardContent>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Repair</Th>
                  <Th>Status</Th>
                  <Th className="hidden text-right sm:table-cell">Updated</Th>
                </Tr>
              </THead>
              <TBody>
                {recentTickets.map((ticket) => (
                  <RowLink key={ticket.id} href={`/tickets/${ticket.id}`}>
                    <Td className="max-w-0">
                      <Link
                        href={`/tickets/${ticket.id}`}
                        title={ticket.subject}
                        className="block max-w-[38rem] truncate font-semibold text-foreground hover:text-accent hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                      <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                        <span className="rf-id text-[11.5px]">#{ticket.number}</span>
                        <span aria-hidden> · </span>
                        {customerLabel(ticket.customer)}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={ticket.status} />
                    </Td>
                    <Td className="hidden text-right text-muted-foreground sm:table-cell">
                      {relativeShort(ticket.updatedAt, clock)}
                    </Td>
                  </RowLink>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader
            icon={AlarmClock}
            title="Needs attention"
            description="Follow-ups and repairs waiting on the next handoff."
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
          <CardContent className="flex flex-col gap-1 py-2">
            {attentionRows.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
                <span
                  className={cn(
                    "rf-num shrink-0 text-[20px] font-semibold",
                    item.count > 0 ? item.tone : "text-muted-foreground",
                  )}
                >
                  {item.count}
                </span>
              </Link>
            ))}
            <Link
              href="/invoices"
              className="mt-1 flex items-center justify-between gap-3 border-t border-border px-2 pt-3 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
            >
              <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
                <ICONS.cash className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Collected this month</span>
              </span>
              <span className="rf-num shrink-0 text-[14px] font-semibold text-foreground">
                {formatCents(monthPayments._sum.amountCents ?? 0)}
              </span>
            </Link>
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          icon={ICONS.dashboard}
          title="Repair pipeline"
          description={`${totalTickets} ticket${totalTickets === 1 ? "" : "s"} by current status`}
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
        <CardContent className="flex flex-col gap-4">
          <div
            role="img"
            aria-label={`Ticket distribution: ${statusRows.map(({ status, count }) => `${count} ${status.toLowerCase()}`).join(", ")}`}
            className="flex h-2 overflow-hidden rounded-full bg-surface-hover"
          >
            {totalTickets > 0
              ? statusRows.map(({ status, count, meta }) =>
                  count > 0 ? (
                    <span
                      key={status}
                      aria-hidden
                      title={`${status}: ${count}`}
                      className={cn("h-full min-w-0", meta.dot)}
                      style={{ width: `${(count / totalTickets) * 100}%` }}
                    />
                  ) : null,
                )
              : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {statusRows.map(({ status, count, meta }) => (
              <Link
                key={status}
                href={`/tickets?status=${encodeURIComponent(status)}`}
                className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
                  <span className="truncate text-[12.5px] font-medium text-muted-foreground">
                    {status}
                  </span>
                </span>
                <span className="rf-num shrink-0 text-[13px] font-semibold text-foreground">
                  {count}
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-14 min-w-0 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13.5px] font-semibold text-foreground">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ACTIONS.next className="ml-auto size-4 shrink-0 text-faint-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
