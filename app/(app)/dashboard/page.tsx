import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { startOfDay, endOfDay } from "date-fns";
import { ChevronRight, Package, TriangleAlert, Users } from "lucide-react";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { RecordGrid } from "@/components/ui/record-card";
import { customerLabel, NEEDS_REPLY_FILTER } from "@/components/tickets/ticket-meta";
import { RepairCard } from "@/components/tickets/repair-card";
import { RevealActiveTab } from "@/components/tickets/reveal-active-tab";
import { OPEN_PART_STATUSES } from "@/components/tickets/part-meta";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { AssistantPanel } from "@/components/dashboard/assistant-panel";
import { checklistProgress, parseChecklist } from "@/lib/checklist";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { formatCents, invoiceTotals } from "@/lib/money";
import { needsReplyTicketIds } from "@/lib/needs-reply";

export const metadata: Metadata = { title: "Repair workbench · Repairs helper" };
export const dynamic = "force-dynamic";

const VIEWS = ["all", "due", "ready", "reply"] as const;
type WorkbenchView = typeof VIEWS[number];

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, branch, params] = await Promise.all([requireUser(), locationWhere(), searchParams]);
  const { shopId, role } = user;
  const now = new Date();
  const showMoney = role !== "TECH";
  const view: WorkbenchView = VIEWS.includes(params.view as WorkbenchView) ? params.view as WorkbenchView : "all";
  const activeWhere = { shopId, ...branch, status: { not: "Resolved" } };

  const [statusGroups, dueToday, overdueCount, unpaidCandidates, awaitingReply, lowStockCount, appointments, shop, location] = await Promise.all([
    db.ticket.groupBy({ by: ["status"], where: { shopId, ...branch }, _count: { _all: true } }),
    db.ticket.count({ where: { ...activeWhere, dueDate: { gte: startOfDay(now), lte: endOfDay(now) } } }),
    db.ticket.count({ where: { ...activeWhere, dueDate: { lt: now } } }),
    showMoney ? db.invoice.findMany({ where: { shopId, ...branch, status: { in: ["SENT", "PARTIAL"] } }, include: { lines: true, payments: true } }) : Promise.resolve([]),
    needsReplyTicketIds(shopId, branch.locationId),
    db.product.count({ where: { shopId, active: true, lowStockAt: { not: null }, stockQty: { lte: db.product.fields.lowStockAt } } }),
    db.appointment.findMany({
      where: { shopId, ...branch, status: "SCHEDULED", endsAt: { gte: now } },
      orderBy: { startsAt: "asc" }, take: 3,
      select: { id: true, title: true, startsAt: true, endsAt: true, customer: { select: { firstName: true, lastName: true, businessName: true } } },
    }),
    db.shop.findUnique({ where: { id: shopId }, select: { name: true } }),
    branch.locationId ? db.location.findFirst({ where: { id: branch.locationId, shopId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const awaitingSet = new Set(awaitingReply);
  const counts = new Map(statusGroups.map((group) => [group.status, group._count._all]));
  const openCount = statusGroups.filter((group) => group.status !== "Resolved").reduce((sum, group) => sum + group._count._all, 0);
  const readyCount = counts.get("Ready for Pickup") ?? 0;
  const balance = unpaidCandidates.reduce((sum, invoice) => sum + invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments).balanceCents, 0);
  const filter: Prisma.TicketWhereInput = view === "due" ? { dueDate: { gte: startOfDay(now), lte: endOfDay(now) } }
    : view === "ready" ? { status: "Ready for Pickup" }
    : view === "reply" ? { id: { in: awaitingReply } } : {};
  const repairs = await db.ticket.findMany({
    where: { ...(view === "reply" ? { shopId, ...branch } : activeWhere), ...filter },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }], take: 6,
    select: {
      id: true, number: true, subject: true, problemType: true, status: true, priority: true, dueDate: true,
      checklist: true, depositCents: true,
      customer: { select: { firstName: true, lastName: true, businessName: true } },
      assignedTo: { select: { name: true } },
      asset: { select: { type: true, make: true, model: true } },
      // Only the outstanding part orders: a received or canceled one is not news.
      partOrders: { where: { status: { in: [...OPEN_PART_STATUSES] } }, select: { status: true } },
      attachments: {
        where: { mimeType: { in: ["image/jpeg", "image/png", "image/webp", "image/avif"] } },
        orderBy: { createdAt: "asc" }, take: 8, select: { id: true, fileName: true },
      },
    },
  });
  const tabs = [
    { view: "all", label: "All repairs", count: openCount, href: "/tickets" },
    { view: "due", label: "Due today", count: dueToday, href: "/tickets?due=today" },
    { view: "ready", label: "Ready for pickup", count: readyCount, href: "/tickets?status=Ready%20for%20Pickup" },
    { view: "reply", label: "Needs a reply", count: awaitingReply.length, href: `/tickets?status=${NEEDS_REPLY_FILTER}` },
  ];
  const selectedTab = tabs.find((tab) => tab.view === view)!;
  const stats = [
    { label: "Open repairs", value: String(openCount), hint: `${counts.get("In Progress") ?? 0} in progress · ${overdueCount} overdue`, href: "/tickets" },
    { label: "Due today", value: String(dueToday), hint: "Promised back today", href: "/tickets?due=today" },
    { label: "Ready for pickup", value: String(readyCount), hint: "Devices ready to collect", href: "/tickets?status=Ready%20for%20Pickup" },
    showMoney
      ? { label: "Outstanding balance", value: formatCents(balance), hint: `Across ${unpaidCandidates.length} unpaid invoice${unpaidCandidates.length === 1 ? "" : "s"}`, href: "/invoices?status=unpaid" }
      : { label: "Customer replies", value: String(awaitingReply.length), hint: "Waiting on your team", href: `/tickets?status=${NEEDS_REPLY_FILTER}` },
  ];

  return (
    <div className="rh-dashboard flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-10 tracking-tight sm:text-[32px]">Repair workbench</h1>
          <p className="mt-1 text-sm text-muted-foreground">{location?.name ?? shop?.name ?? "Your shop"} · {now.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild className="h-10 min-w-36"><Link href="/tickets/new"><ACTIONS.add />New repair</Link></Button>
        </div>
      </header>
      <SetupChecklist />

      <Card className="grid grid-cols-2 p-4 shadow-none lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Link key={stat.label} href={stat.href} className={cn("min-w-0 rounded-sm px-3 py-2 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 lg:py-0", index % 2 === 1 && "border-l border-border", index > 1 && "lg:border-l lg:border-border")}>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className={cn("font-semibold leading-[44px] tracking-tight tabular-nums", stat.value.length > 8 ? "text-[28px]" : "text-[36px]")}>{stat.value}</span>
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
          </Link>
        ))}
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="repair-focus" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="repair-focus" className="text-lg font-semibold">Repairs in focus</h2>
            <Link href={selectedTab.href} className="text-sm font-medium text-accent-soft-foreground hover:underline">View all {selectedTab.count} repairs →</Link>
          </div>
          <RevealActiveTab>
            <FilterTabs
              aria-label="Repair queue filters"
              className="mb-4"
              tabs={tabs.map((tab) => ({
                label: tab.label,
                href: tab.view === "all" ? "/dashboard" : `/dashboard?view=${tab.view}`,
                active: view === tab.view,
                count: tab.count,
              }))}
            />
          </RevealActiveTab>
          {repairs.length === 0 ? (
            <Card className="shadow-none"><EmptyState icon={ICONS.ticket} title={view === "all" ? "No open repairs" : "Nothing in this queue"} hint={view === "all" ? "Check in a device to start a repair." : "Your repair queue will update as work comes in."} action={<Button asChild><Link href="/tickets/new"><ACTIONS.add />New repair</Link></Button>} /></Card>
          ) : (
            <RecordGrid className="2xl:grid-cols-2">
              {repairs.map((repair) => (
                <li key={repair.id}>
                  <RepairCard
                    now={now.getTime()}
                    className="h-full"
                    repair={{
                      ...repair,
                      needsReply: awaitingSet.has(repair.id),
                      checklist: checklistProgress(parseChecklist(repair.checklist)),
                    }}
                  />
                </li>
              ))}
            </RecordGrid>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Showing {repairs.length} of {selectedTab.count} {view === "all" ? "open repairs" : "repairs in this queue"}</p>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <AssistantPanel overdueCount={overdueCount} />
          <Card id="attention" className="scroll-mt-6 p-4 shadow-none">
            <h2 className="mb-3 text-lg font-semibold">Needs attention</h2>
            <AttentionRow href="/tickets?due=overdue" icon={TriangleAlert} label={`${overdueCount} repair${overdueCount === 1 ? "" : "s"} overdue`} tone="text-destructive" />
            <AttentionRow href={`/tickets?status=${NEEDS_REPLY_FILTER}`} icon={Users} label={`${awaitingReply.length} customer${awaitingReply.length === 1 ? "" : "s"} need a reply`} tone="text-status-in-progress-fg" />
            <AttentionRow href="/inventory?filter=low" icon={Package} label={`${lowStockCount} product${lowStockCount === 1 ? "" : "s"} low in stock`} tone="text-status-in-progress-fg" />
          </Card>
          <Card className="p-4 shadow-none">
            <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Next appointments</h2><Link href="/appointments" className="text-xs text-accent-soft-foreground hover:underline">View all</Link></div>
            {appointments.length === 0 ? <p className="py-2 text-sm text-muted-foreground">No upcoming appointments.</p> : <ul className="flex flex-col gap-3">
              {appointments.map((appointment) => <li key={appointment.id}>
                <Link href={`/appointments?date=${appointment.startsAt.toISOString().slice(0, 10)}`} data-touch-control className="flex items-center gap-3 rounded-md hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{appointment.startsAt.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{appointment.customer ? customerLabel(appointment.customer) : appointment.title}</span><span className="block truncate text-xs text-muted-foreground">{appointment.startsAt.toLocaleDateString("en", { month: "short", day: "numeric" })} · {appointment.title}</span></span>
                </Link>
              </li>)}
            </ul>}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function AttentionRow({ href, icon: Icon, label, tone }: {
  href: string; icon: React.ComponentType<{ className?: string }>; label: string; tone: string;
}) {
  return <Link href={href} data-touch-control className="flex min-h-9 items-center gap-2 rounded-md text-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className={cn("size-[18px] shrink-0", tone)} /><span className="min-w-0 flex-1">{label}</span><ChevronRight className="size-4 text-muted-foreground" aria-hidden /></Link>;
}
