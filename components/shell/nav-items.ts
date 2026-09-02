import { ICONS, type LucideIcon } from "@/components/ui/icons";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
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
  { label: "Customers", href: "/customers", icon: ICONS.customer },
  { label: "Tickets", href: "/tickets", icon: ICONS.ticket },
  { label: "Estimates", href: "/estimates", icon: ICONS.estimate },
  { label: "Invoices", href: "/invoices", icon: ICONS.invoice },
  { label: "POS", href: "/pos", icon: ICONS.pos },
  { label: "Inventory", href: "/inventory", icon: ICONS.inventory },
  { label: "Marketing", href: "/marketing", icon: ICONS.marketing },
  { label: "Reports", href: "/reports", icon: ICONS.reports },
  { label: "Shop Display", href: "/display", icon: ICONS.display },
  { label: "Time clock", href: "/time-clock", icon: ICONS.timeClock },
  { label: "Settings", href: "/settings", icon: ICONS.settings },
];
