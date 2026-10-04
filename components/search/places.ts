import type { LucideIcon } from "lucide-react";
import { ICONS } from "@/components/ui/icons";
import type { SearchType } from "./types";

/**
 * What the search sheet offers besides search results: the four start boxes
 * and every place in the app, in the shop's own words. Pure, so it can be
 * tested and matched as you type.
 */

export interface Row {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  price?: string;
  href: string;
  picture?: string | null;
  initials?: string;
  icon?: LucideIcon;
  /** Plus mark over a picture: this starts something new. */
  add?: boolean;
}

export const HOME = "/images/home";
const PRODUCTS = "/images/products";

/** The four things the counter starts all day, as picture boxes. */
export const START_TILES: Row[] = [
  { id: "start-repair", title: "New repair", subtitle: "Check a device in", href: "/tickets/new", picture: `${PRODUCTS}/phone.webp`, add: true },
  { id: "start-sale", title: "New sale", subtitle: "Scan or tap items", href: "/pos", picture: `${HOME}/card-terminal.webp` },
  { id: "start-customer", title: "Add customer", subtitle: "Name or phone", href: "/customers/new", picture: `${HOME}/customers-cards.webp`, add: true },
  { id: "start-visit", title: "Book a visit", subtitle: "Drop-off or pickup", href: "/appointments?new=1", picture: `${HOME}/diary.webp` },
];

/** Everywhere else, in the shop's own words. Matched as you type ("inv" offers Invoices). */
export const PLACES: (Row & { money?: boolean })[] = [
  { id: "go-repairs", title: "Repairs", href: "/tickets", icon: ICONS.ticket },
  { id: "go-pickup", title: "Ready for pickup", href: "/tickets?status=Ready%20for%20Pickup", icon: ICONS.ticket },
  { id: "go-customers", title: "Customers", href: "/customers", icon: ICONS.customer },
  { id: "go-invoices", title: "Invoices", href: "/invoices", icon: ICONS.invoice, money: true },
  { id: "go-unpaid", title: "Unpaid invoices", href: "/invoices?status=unpaid", icon: ICONS.invoice, money: true },
  { id: "go-estimates", title: "Estimates", href: "/estimates", icon: ICONS.estimate, money: true },
  { id: "go-new-invoice", title: "New invoice", href: "/invoices/new", icon: ICONS.invoice, money: true },
  { id: "go-new-estimate", title: "New estimate", href: "/estimates/new", icon: ICONS.estimate, money: true },
  { id: "go-sell", title: "Sell", subtitle: "The register", href: "/pos", icon: ICONS.pos },
  { id: "go-stock", title: "Stock", href: "/inventory", icon: ICONS.inventory },
  { id: "go-low", title: "Low stock", href: "/inventory?filter=low", icon: ICONS.product },
  { id: "go-suppliers", title: "Suppliers", href: "/inventory/vendors", icon: ICONS.vendor },
  { id: "go-orders", title: "Purchase orders", href: "/inventory/purchase-orders", icon: ICONS.purchaseOrder },
  { id: "go-enquiries", title: "Enquiries", href: "/leads", icon: ICONS.lead },
  { id: "go-new-enquiry", title: "New enquiry", href: "/leads/new", icon: ICONS.lead },
  { id: "go-appointments", title: "Appointments", href: "/appointments", icon: ICONS.appointment },
  { id: "go-overview", title: "Shop overview", href: "/dashboard", icon: ICONS.dashboard },
  { id: "go-reports", title: "Reports", href: "/reports", icon: ICONS.reports },
  { id: "go-marketing", title: "Marketing", href: "/marketing", icon: ICONS.marketing },
  { id: "go-time", title: "Time clock", href: "/time-clock", icon: ICONS.timeClock },
  { id: "go-display", title: "Shop display", href: "/display", icon: ICONS.display },
  { id: "go-drawers", title: "Cash drawers", href: "/pos/drawers", icon: ICONS.cash, money: true },
  { id: "go-settings", title: "Settings", href: "/settings", icon: ICONS.settings },
  { id: "go-home", title: "Home", href: "/counter", icon: ICONS.location },
];

/** Where "See all" goes for each group: the list, searched for the same words. */
export const LIST_FOR: Partial<Record<SearchType, string>> = {
  ticket: "/tickets",
  customer: "/customers",
  invoice: "/invoices",
  estimate: "/estimates",
  product: "/inventory",
};

/** The local matches for what is typed: start boxes and places whose name contains it. */
export function localMatches(query: string, showMoney: boolean): { starts: Row[]; places: Row[] } {
  const lower = query.trim().toLowerCase();
  if (!lower) return { starts: [], places: [] };
  const hit = (row: Row) => row.title.toLowerCase().includes(lower);
  return {
    starts: START_TILES.filter(hit),
    places: PLACES.filter((row) => (showMoney || !row.money) && hit(row)).slice(0, 4),
  };
}
