import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { locationWhere } from "@/lib/location";
import { formatCents } from "@/lib/money";
import { reportsDayHref } from "@/lib/dashboard/logic";
import { loadTodayStrip, type TodayStripData } from "@/lib/dashboard/today";
import { requestNow } from "@/lib/now";
import { cn } from "@/components/ui/cn";
import { READY_FOR_PICKUP_STATUS } from "@/components/tickets/ticket-meta";

/**
 * Three numbers in one slim row, for the Home screen: what the shop took today,
 * what customers still owe, and how many devices wait for pickup. Each one is a
 * link to the list behind it, and "Shop overview" opens the full page.
 *
 * Owners and front desk only: it renders nothing for a technician, and for a
 * technician it also never runs the money queries. The figures come from the
 * same loader as /dashboard, so they match it: today is the shop's own day.
 */
export async function TodayStrip({ className }: { className?: string }) {
  const [user, branch] = await Promise.all([requireUser(), locationWhere()]);
  const now = requestNow();
  const data = await loadTodayStrip(user, branch, now);
  if (!data) return null;
  return <TodayStripView data={data} className={className} />;
}

/** The strip itself, separate from its data so it can be drawn (and tested) without a database. */
export function TodayStripView({ data, className }: { data: TodayStripData; className?: string }) {
  const stats = [
    { label: "Takings today", value: formatCents(data.takingsCents), href: reportsDayHref(data.todayKey) },
    { label: "Owed to you", value: `${formatCents(data.owedCents)}${data.owedTruncated ? "+" : ""}`, href: "/invoices?status=unpaid" },
    { label: "Ready for pickup", value: String(data.readyCount), href: `/tickets?status=${encodeURIComponent(READY_FOR_PICKUP_STATUS)}` },
  ];
  return (
    <nav aria-label="Today at a glance" className={cn("flex flex-wrap items-stretch gap-2 rounded-2xl border border-border bg-surface p-2", className)}>
      <ul className="grid min-w-0 flex-1 grid-cols-3 gap-2">
        {stats.map((stat) => (
          <li key={stat.label} className="min-w-0">
            <Link
              href={stat.href}
              data-touch-control
              className="flex h-full min-h-14 flex-col justify-center rounded-xl px-2.5 py-1.5 leading-tight hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
            >
              {/* A label may wrap to two lines on a phone; a figure is never cut. */}
              <span className="text-[13px] font-medium leading-tight text-muted-foreground">{stat.label}</span>
              <span className="rf-num whitespace-nowrap text-base font-semibold sm:text-xl">{stat.value}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/dashboard"
        data-touch-control
        className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl px-4 text-[15px] font-semibold text-accent-soft-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
      >
        Shop overview
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </nav>
  );
}
