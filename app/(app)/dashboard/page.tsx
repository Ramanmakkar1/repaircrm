import Link from "next/link";
import { startOfDay, endOfDay, startOfMonth, formatDistanceToNow } from "date-fns";
import { Wrench } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, StatusDot } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
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
        take: 8,
        include: { customer: true, assignedTo: true },
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

  const stats = [
    { label: "Open Tickets", value: String(openTickets) },
    { label: "Due Today", value: String(dueToday) },
    {
      label: "Unpaid Invoices",
      value: `${unpaidCandidates.length} · ${formatCents(unpaidBalanceCents)}`,
    },
    {
      label: "This Month Revenue",
      value: formatCents(monthPayments._sum.amountCents ?? 0),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description="A quick look at what's happening in your shop."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="text-xs font-medium text-muted-foreground">
                {stat.label}
              </span>
              <span className="text-2xl font-semibold tracking-tight text-foreground">
                {stat.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {recentTickets.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="No tickets yet"
                hint="New repair tickets will show up here as they come in."
              />
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>#</Th>
                    <Th>Customer</Th>
                    <Th>Subject</Th>
                    <Th>Status</Th>
                    <Th>Updated</Th>
                  </Tr>
                </THead>
                <TBody>
                  {recentTickets.map((t) => (
                    <Tr key={t.id}>
                      <Td className="tabular-nums">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {t.number}
                        </Link>
                      </Td>
                      <Td>
                        {t.customer.firstName} {t.customer.lastName}
                      </Td>
                      <Td className="max-w-[220px] truncate">{t.subject}</Td>
                      <Td>
                        <StatusBadge status={t.status} />
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {formatDistanceToNow(t.updatedAt, { addSuffix: true })}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ticket Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {TICKET_STATUSES.map((status) => (
              <div key={status} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] text-foreground">
                  <StatusDot status={status} />
                  {status}
                </span>
                <span className="text-[13px] font-medium tabular-nums text-foreground">
                  {statusCounts.get(status) ?? 0}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
