import type { Metadata } from "next";
import Link from "next/link";
import { endOfDay, startOfDay } from "date-fns";
import { ArrowUpRight, CalendarDays, LayoutGrid, Package, ReceiptText, ShoppingBag, Users, Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";

export const metadata: Metadata = { title: "Home · Repairs helper" };
export const dynamic = "force-dynamic";

/** The counter opens with tasks people recognise, rather than a CRM navigation menu. */
export default async function CounterPage() {
  const [{ shopId, role, name }, branch] = await Promise.all([requireUser(), locationWhere()]);
  const now = new Date();
  const [open, ready, today, unpaid] = await Promise.all([
    db.ticket.count({ where: { shopId, ...branch, NOT: { status: RESOLVED_STATUS } } }),
    db.ticket.count({ where: { shopId, ...branch, status: "Ready for Pickup" } }),
    db.appointment.count({ where: { shopId, startsAt: { gte: startOfDay(now), lte: endOfDay(now) }, status: { not: "CANCELED" } } }),
    role !== "TECH" ? db.invoice.count({ where: { shopId, ...branch, status: { in: ["SENT", "PARTIAL"] } } }) : Promise.resolve(0),
  ]);
  const cards = [
    { key: "repairs", title: "Repairs", description: "Check in, fix, and hand back", detail: `${open} open · ${ready} ready for pickup`, Icon: Wrench },
    { key: "invoices", title: "Invoices", description: "Create a bill or find an invoice", detail: role !== "TECH" ? `${unpaid} waiting for payment` : "Quotes, bills, and receipts", Icon: ReceiptText },
    { key: "sales", title: "Sales", description: "Sell products and take payment", detail: "Photo catalog & checkout", Icon: ShoppingBag },
    { key: "customers", title: "Customers", description: "Find details and repair history", detail: "Find or add a customer", Icon: Users },
    { key: "products", title: "Products & parts", description: "Photos, prices, and stock", detail: "Accessories, parts & services", Icon: Package },
    { key: "appointments", title: "Appointments", description: "Book a visit or see today’s calendar", detail: `${today} booked today`, Icon: CalendarDays },
  ];
  const firstName = name.trim().split(/\s+/)[0];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{firstName ? `Hello, ${firstName}` : "Your shop"}</p>
        <h1 className="max-w-2xl text-[28px] font-semibold leading-tight tracking-tight sm:text-[36px]">What would you like to do?</h1>
        <p className="mt-3 text-base text-muted-foreground">Tap a box to get started.</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {cards.map(({ key, title, description, detail, Icon }) => (
          <li key={key}>
            <Link href={`/counter/${key}`} className="group relative flex h-full min-h-[200px] flex-col rounded-xl border border-border bg-white p-4 transition-colors hover:border-[#006aff] active:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[216px] sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-2"><Icon className="size-8 text-[#006aff]" strokeWidth={1.6} aria-hidden /><ArrowUpRight className="size-5 text-muted-foreground" aria-hidden /></div>
              <h2 className="text-lg font-semibold leading-tight sm:text-xl">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              <p className="mt-auto pt-5 text-xs font-medium text-muted-foreground">{detail}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/counter/tools" className="flex min-h-20 items-center gap-4 rounded-xl border border-border bg-white px-5 py-4 hover:border-[#006aff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <LayoutGrid className="size-7 shrink-0 text-[#006aff]" aria-hidden />
        <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">More tools & settings</span><span className="mt-1 block text-sm text-muted-foreground">Reports, estimates, marketing, time clock, and shop settings</span></span>
        <ArrowUpRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}
