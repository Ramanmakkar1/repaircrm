import type { Metadata } from "next";
import Link from "next/link";
import { endOfDay, startOfDay } from "date-fns";
import { ChevronRight } from "lucide-react";

import { ViewSwitch } from "@/components/counter/view-switch";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { RepairPilotMark } from "@/components/brand/repairpilot";
import { cn } from "@/components/ui/cn";
import { ICONS, type LucideIcon } from "@/components/ui/icons";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Home · Repairs helper" };
export const dynamic = "force-dynamic";

type CounterCard = {
  href: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  /** The number worth knowing before tapping, when there is one. */
  count?: number;
  /** Turns the count red: something here is waiting on a person. */
  urgent?: boolean;
};

/**
 * The Simple-mode home screen — the whole shop in a handful of big cards.
 *
 * Built for a counter tablet and a phone in a pocket: every target is a thumb
 * wide, there is no side menu to get lost in, and nothing here is a setting.
 * The cards are the jobs a shop does all day, in the order they happen: a
 * device comes in, gets found again, gets paid for, goes home. Everything else
 * Repairs helper does is still there — one tap on "Full menu" — it is just not in
 * the way.
 *
 * Each count is one indexed `count()`; the page stays fast enough to be the
 * thing that opens every time the app is launched from a home-screen icon.
 */
export default async function CounterPage() {
  const [{ shopId, role, name }, prefs, branch] = await Promise.all([
    requireUser(),
    readUiPrefs(),
    locationWhere(),
  ]);
  const now = new Date();
  const showMoney = role !== "TECH";

  const [open, ready, late, today, unpaid] = await Promise.all([
    db.ticket.count({ where: { shopId, ...branch, NOT: { status: RESOLVED_STATUS } } }),
    db.ticket.count({ where: { shopId, ...branch, status: "Ready for Pickup" } }),
    db.ticket.count({
      where: { shopId, ...branch, dueDate: { lt: now }, NOT: { status: RESOLVED_STATUS } },
    }),
    db.appointment.count({
      where: {
        shopId,
        startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
        status: { not: "CANCELED" },
      },
    }),
    showMoney
      ? db.invoice.count({ where: { shopId, ...branch, status: { in: ["SENT", "PARTIAL"] } } })
      : Promise.resolve(0),
  ]);

  const cards: CounterCard[] = [
    {
      href: "/tickets/new",
      title: "Check in a repair",
      hint: "New customer or returning — one screen",
      icon: ICONS.ticket,
      tone: "bg-status-new-bg text-status-new-fg",
    },
    {
      href: "/tickets",
      title: "Repairs",
      hint: late > 0 ? `${late} running late` : "Find a job, update it",
      icon: ICONS.ticket,
      tone: "bg-status-in-progress-bg text-status-in-progress-fg",
      count: open,
      urgent: late > 0,
    },
    {
      href: `/tickets?status=${encodeURIComponent("Ready for Pickup")}`,
      title: "Ready for pickup",
      hint: "Hand a device back",
      icon: ICONS.ticket,
      tone: "bg-status-ready-bg text-status-ready-fg",
      count: ready,
    },
    {
      href: "/pos",
      title: "Take a payment",
      hint: "Sell an item or ring up a repair",
      icon: ICONS.pos,
      tone: "bg-status-resolved-bg text-status-resolved-fg",
    },
    {
      href: "/customers",
      title: "Customers",
      hint: "Look someone up, call them back",
      icon: ICONS.customer,
      tone: "bg-status-waiting-bg text-status-waiting-fg",
    },
    {
      href: "/appointments",
      title: "Appointments",
      hint: today === 1 ? "1 booked today" : `${today} booked today`,
      icon: ICONS.appointment,
      tone: "bg-status-new-bg text-status-new-fg",
      count: today,
    },
    {
      href: "/inventory",
      title: "Stock",
      hint: "Check a part, scan a barcode",
      icon: ICONS.inventory,
      tone: "bg-status-waiting-bg text-status-waiting-fg",
    },
    ...(showMoney
      ? [
          {
            href: "/invoices?status=SENT",
            title: "Money owed",
            hint: unpaid === 0 ? "Everyone is paid up" : "Unpaid invoices",
            icon: ICONS.invoice,
            tone: "bg-status-overdue-bg text-status-overdue-fg",
            count: unpaid,
          } satisfies CounterCard,
        ]
      : []),
  ];

  const firstName = name.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <RepairPilotMark className="hidden size-20 sm:flex" />
          <div>
            <p className="mb-2 text-xs font-semibold text-accent-soft-foreground">YOUR SHOP, SIMPLIFIED</p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[30px]">
              {firstName ? `Hi ${firstName}` : "Welcome"}. Let’s get to work.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Everything you need at the counter. Choose a task to get started.</p>
          </div>
        </div>
        <ViewSwitch simple={prefs.simple} />
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.title}>
            <Link
              href={card.href}
              className={cn(
                "group relative flex h-full min-h-48 flex-col items-start gap-4 rounded-xl border border-border bg-white p-4 transition-colors sm:min-h-52 sm:p-6",
                "hover:border-[#006aff] hover:bg-white active:bg-surface-hover",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            >
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-[#006aff]",
                )}
              >
                <card.icon className="size-7" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold leading-tight text-foreground">
                  {card.title}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-[13px] leading-snug",
                    card.urgent ? "font-semibold text-status-overdue-fg" : "text-muted-foreground",
                  )}
                >
                  {card.hint}
                </span>
              </span>
              {card.count !== undefined && card.count > 0 ? (
                <span className="rf-num absolute top-6 right-5 text-[26px] font-semibold leading-none text-foreground">
                  {card.count}
                </span>
              ) : (
                <ChevronRight className="absolute right-5 top-6 size-5 text-faint-foreground" aria-hidden />
              )}
            </Link>
          </li>
        ))}
      </ul>

      <details className="group rounded-xl border border-border bg-white p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-center gap-3"><ICONS.settings className="size-5 text-[#006aff]" />All tools & settings</span>
          <ChevronRight className="size-5 transition-transform group-open:rotate-90" />
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">Every feature is still here. Opening a tool keeps Easy mode on.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {NAV_ITEMS.filter((item) => item.href !== "/dashboard").map((item) => (
            <div key={item.href}>
              <Link href={item.href} className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-[#006aff] focus-visible:ring-2 focus-visible:ring-ring">
                <item.icon className="size-4 shrink-0 text-[#006aff]" />{item.label}
              </Link>
              {item.children?.map((child) => <Link key={child.href} href={child.href} className="mt-2 block px-3 text-xs text-muted-foreground hover:underline">{child.label}</Link>)}
            </div>
          ))}
        </div>
      </details>
      <p className="text-center text-xs text-muted-foreground">Easy mode changes the layout, not your features. Your view is remembered on this device.</p>
    </div>
  );
}
