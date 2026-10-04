import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Boxes, LayoutGrid, Plus, Search, Store } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { requestNow } from "@/lib/now";
import { reportDays } from "@/lib/dashboard/logic";
import { loadShopZone } from "@/lib/dashboard/shop-zone";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import { attentionItems } from "@/components/counter/attention";
import { loadAttentionCounts } from "@/components/counter/attention-data";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { TodayStrip } from "@/components/dashboard/today-strip";
import { HomeTabs, type HomeTab } from "@/components/counter/home-tabs";
import { asHomeTab, HOME_TAB_COOKIE } from "@/components/counter/home-tab-cookie";
import { PictureTile, type PictureTileProps } from "@/components/counter/picture-tile";
import { AttentionList, SettingsLink, StartButtons, type AttentionItem } from "@/components/counter/start-panel";

export const metadata: Metadata = { title: "Home · Repairs helper" };
export const dynamic = "force-dynamic";

type Tile = PictureTileProps & { money?: boolean; ownerOnly?: boolean };

const PRODUCTS = "/images/products";
const HOME = "/images/home";

/**
 * Home works like a register: the two jobs that happen all day are pinned,
 * what needs a person sits under them, and everything else is one tab away,
 * grouped the way the shop thinks (the counter, the stock room, the office).
 * Every tile has a picture, a plain name and one line of live detail.
 * Nothing is removed - the long tail lives under "More tools".
 */
export default async function CounterPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ shopId, role, name }, branch, params, jar] = await Promise.all([requireUser(), locationWhere(), searchParams, cookies()]);
  const nowMs = requestNow();
  // "Booked today" is the shop's own day (Shop.timezone), not the server's.
  const [today] = reportDays(nowMs, await loadShopZone(shopId), 1);
  const [open, booked, counts] = await Promise.all([
    db.ticket.count({ where: { shopId, ...branch, NOT: { status: RESOLVED_STATUS } } }),
    db.appointment.count({ where: { shopId, ...branch, startsAt: { gte: new Date(today.from), lt: new Date(today.toExclusive) }, status: { not: "CANCELED" } } }),
    // The same numbers as the bell in the controls row and the phone tab bar.
    loadAttentionCounts({ shopId, role }, branch, new Date(nowMs)),
  ]);
  const { ready, unpaid, low } = counts;

  const allowed = (tile: Tile) => (!tile.money || role !== "TECH") && (!tile.ownerOnly || role === "OWNER");
  const render = (tiles: Tile[]) => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {tiles.filter(allowed).map((tile) => (
        <li key={tile.title}>
          <PictureTile href={tile.href} title={tile.title} detail={tile.detail} photo={tile.photo} alert={tile.alert} mark={tile.mark} />
        </li>
      ))}
    </ul>
  );

  const counter: Tile[] = [
    { href: "/tickets", title: "Repairs", detail: `${open} open · ${ready} ready`, photo: `${PRODUCTS}/phone.webp` },
    { href: "/tickets?status=Ready%20for%20Pickup", title: "Pickup & pay", detail: "Hand a device back", photo: `${HOME}/pickup-bag.webp`, alert: ready ? `${ready} ready` : undefined },
    { href: "/invoices?status=unpaid", title: "Take payment", detail: unpaid ? `${unpaid} unpaid` : "Collect what's owed", photo: `${HOME}/card-terminal.webp`, money: true },
    { href: "/customers/new", title: "Add customer", detail: "Name or phone", photo: `${HOME}/customers-cards.webp`, mark: Plus },
    { href: "/customers", title: "Find customer", detail: "Search name or phone", photo: `${HOME}/customers-cards.webp`, mark: Search },
    { href: "/appointments", title: "Book a visit", detail: booked ? `${booked} booked today` : "Appointments", photo: `${HOME}/diary.webp` },
  ];

  const stock: Tile[] = [
    { href: "/inventory", title: "View & add stock", detail: "Find an item, tap +", photo: `${HOME}/parts-bin.webp` },
    { href: "/inventory?filter=low", title: "Low stock", detail: low ? `${low} running low` : "Nothing running low", photo: `${PRODUCTS}/screen-protector.webp`, alert: low ? `${low} low` : undefined },
    { href: "/inventory/new", title: "Add product", detail: "Name, price, quantity", photo: `${HOME}/price-tag.webp` },
    { href: "/inventory/purchase-orders", title: "Purchase orders", detail: "Order parts, receive deliveries", photo: `${HOME}/delivery-boxes.webp`, ownerOnly: true },
    { href: "/inventory/vendors", title: "Suppliers", detail: "Where you buy parts", photo: `${HOME}/delivery-van.webp`, ownerOnly: true },
    { href: "/inventory/import", title: "Import stock", detail: "From Excel or CSV", photo: `${HOME}/import-folder.webp`, ownerOnly: true },
  ];

  const shop: Tile[] = [
    { href: "/counter/invoices", title: "Money", detail: unpaid ? `${unpaid} unpaid invoices` : "Invoices & quotes", photo: `${HOME}/invoice-pad.webp`, money: true },
    { href: "/reports", title: "Reports", detail: "How the shop is doing", photo: `${HOME}/report-chart.webp` },
    { href: "/time-clock", title: "Time clock", detail: "Clock in or out", photo: `${HOME}/time-clock.webp` },
    { href: "/display", title: "Shop display", detail: "The customer screen", photo: `${HOME}/display-screen.webp` },
    { href: "/marketing", title: "Marketing", detail: "Messages to customers", photo: `${HOME}/megaphone.webp` },
    { href: "/counter/tools", title: "More tools", detail: "Everything else", photo: `${HOME}/toolbox.webp` },
  ];

  const tabs: HomeTab[] = [
    { key: "counter", label: "Counter", short: "Counter", icon: <Store className="size-5" />, content: render(counter) },
    { key: "stock", label: "Stock & purchasing", short: "Stock", icon: <Boxes className="size-5" />, content: render(stock) },
    { key: "shop", label: "Shop management", short: "Shop", icon: <LayoutGrid className="size-5" />, content: render(shop) },
  ];

  // Ready, replies, overdue, new enquiries, unpaid, low stock: one list for Home, the bell and the tab bar.
  const attention: AttentionItem[] = attentionItems(counts, role);

  const firstName = name.trim().split(/\s+/)[0];
  const initial = asHomeTab(params.tab) ?? asHomeTab(jar.get(HOME_TAB_COOKIE)?.value) ?? "counter";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6">
        <aside className="flex min-w-0 flex-col gap-4">
          <div>
            <h1 className="text-[26px] font-semibold leading-9 tracking-tight">{firstName ? `Hello, ${firstName}` : "Your shop"}</h1>
            <p className="text-base text-muted-foreground">Tap a box to get started.</p>
          </div>
          <StartButtons />
          <AttentionList items={attention} />
          <SettingsLink className="mt-auto hidden lg:flex" />
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          <TodayStrip />
          <HomeTabs tabs={tabs} initial={initial} />
        </div>
      </div>
      <SettingsLink className="lg:hidden" />
      <SetupChecklist />
    </div>
  );
}
