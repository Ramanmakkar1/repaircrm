import { ICONS, type LucideIcon } from "@/components/ui/icons";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Second-level destinations that belong to this object type.
   *
   * These render as indented, icon-less text under the parent — the parent
   * keeps the glyph, the children are words. Icon-on-every-row is what makes a
   * rail look busy, and it also flattens the hierarchy: if a vendor list and
   * the Inventory section both carry a picture, nothing tells you one is
   * inside the other.
   *
   * Everything listed here already shipped and worked; it was just unreachable
   * without typing the URL. A feature nobody can find is a feature nobody
   * bought.
   */
  children?: { label: string; href: string }[];
}

/**
 * Glyphs come from the app-wide concept map rather than being picked here, so
 * the rail, the ⌘K palette, the New menu and every empty state draw a ticket
 * with the same wrench. Changing a concept's glyph in `components/ui/icons.ts`
 * moves the sidebar with it.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: ICONS.dashboard },
  // Leads and Appointments sit ahead of Customers on purpose: the rail now
  // reads front-to-back in the order work actually arrives at a shop —
  // enquiry, booking, customer, ticket.
  { label: "Leads", href: "/leads", icon: ICONS.lead },
  { label: "Appointments", href: "/appointments", icon: ICONS.appointment },
  {
    label: "Customers",
    href: "/customers",
    icon: ICONS.customer,
    children: [{ label: "Import", href: "/customers/import" }],
  },
  { label: "Tickets", href: "/tickets", icon: ICONS.ticket },
  { label: "Estimates", href: "/estimates", icon: ICONS.estimate },
  {
    label: "Invoices",
    href: "/invoices",
    icon: ICONS.invoice,
    children: [{ label: "Recurring", href: "/invoices/recurring" }],
  },
  {
    label: "POS",
    href: "/pos",
    icon: ICONS.pos,
    children: [{ label: "Cash drawers", href: "/pos/drawers" }],
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: ICONS.inventory,
    children: [
      { label: "Vendors", href: "/inventory/vendors" },
      { label: "Purchase orders", href: "/inventory/purchase-orders" },
      { label: "Import", href: "/inventory/import" },
    ],
  },
  { label: "Marketing", href: "/marketing", icon: ICONS.marketing },
  { label: "Reports", href: "/reports", icon: ICONS.reports },
  { label: "Shop Display", href: "/display", icon: ICONS.display },
  { label: "Time clock", href: "/time-clock", icon: ICONS.timeClock },
  { label: "Settings", href: "/settings", icon: ICONS.settings },
];
