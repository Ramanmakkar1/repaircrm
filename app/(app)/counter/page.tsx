import type { Metadata } from "next";
import Link from "next/link";
import { endOfDay, startOfDay } from "date-fns";
import { ChevronRight } from "lucide-react";

import { SimpleModeButton } from "@/components/counter/simple-mode-button";
import { cn } from "@/components/ui/cn";
import { ICONS, type LucideIcon } from "@/components/ui/icons";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Home · RepairPilot" };
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
 * RepairPilot does is still there — one tap on "Full menu" — it is just not in
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
      ? db.invoice.count({ where: { shopId, status: { in: ["SENT", "PARTIAL"] } } })
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
          {firstName ? `Hi ${firstName}` : "Welcome"} — what&rsquo;s next?
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Tap a card. Or press Talk at the bottom and just say it.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4">
        {cards.map((card) => (
          <li key={card.title}>
            <Link
              href={card.href}
              className={cn(
                "group flex min-h-[6.5rem] items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-xs transition-colors sm:p-5",
                "hover:border-border-strong hover:bg-surface-hover active:bg-surface-hover",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            >
              <span
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-xl",
                  card.tone,
                )}
              >
                <card.icon className="size-7" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-bold leading-tight text-foreground">
                  {card.title}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-[14px] leading-snug",
                    card.urgent ? "font-semibold text-status-overdue-fg" : "text-muted-foreground",
                  )}
                >
                  {card.hint}
                </span>
              </span>
              {card.count !== undefined && card.count > 0 ? (
                <span className="rf-num shrink-0 text-[26px] font-bold leading-none text-foreground">
                  {card.count}
                </span>
              ) : (
                <ChevronRight className="size-5 shrink-0 text-faint-foreground" aria-hidden />
              )}
            </Link>
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[14px] text-muted-foreground">
        <span>
          {prefs.simple
            ? "Simple mode is on for this device."
            : "This is Simple mode’s home screen."}
        </span>
        {prefs.simple ? (
          <SimpleModeButton on={false} variant="outline">
            Show the full menu
          </SimpleModeButton>
        ) : (
          <SimpleModeButton on variant="outline">
            Use Simple mode on this device
          </SimpleModeButton>
        )}
      </footer>
    </div>
  );
}
