import { ICONS, type LucideIcon } from "@/components/ui/icons";

/**
 * Full view's rail: every area of the shop in four groups, named the same way
 * as Home, the hubs and the Back button (Stock, not Inventory; Enquiries, not
 * Leads; Recurring invoices). Pure data so it can be tested on its own.
 */
export type RailChild = { label: string; href: string; ownerOnly?: boolean; money?: boolean };
export type RailItem = { label: string; href: string; icon: LucideIcon; money?: boolean; ownerOnly?: boolean; children?: RailChild[] };
export type RailGroup = { label: string; items: RailItem[] };

const GROUPS: RailGroup[] = [
  {
    label: "Counter",
    items: [
      { label: "Repairs", href: "/tickets", icon: ICONS.ticket },
      { label: "Appointments", href: "/appointments", icon: ICONS.appointment },
      { label: "Customers", href: "/customers", icon: ICONS.customer, children: [{ label: "Import customers", href: "/customers/import", ownerOnly: true }] },
      { label: "Enquiries", href: "/leads", icon: ICONS.lead },
    ],
  },
  {
    label: "Sales & payments",
    items: [
      { label: "Sell", href: "/pos", icon: ICONS.pos, money: true, children: [{ label: "Cash drawers", href: "/pos/drawers", ownerOnly: true }] },
      { label: "Invoices", href: "/invoices", icon: ICONS.invoice, money: true, children: [{ label: "Recurring invoices", href: "/invoices/recurring" }] },
      { label: "Estimates", href: "/estimates", icon: ICONS.estimate, money: true },
    ],
  },
  {
    label: "Stock & purchasing",
    items: [
      {
        label: "Stock",
        href: "/inventory",
        icon: ICONS.inventory,
        children: [
          { label: "Purchase orders", href: "/inventory/purchase-orders", ownerOnly: true },
          { label: "Suppliers", href: "/inventory/vendors", ownerOnly: true },
          { label: "Import stock", href: "/inventory/import", ownerOnly: true },
        ],
      },
    ],
  },
  {
    label: "Shop management",
    items: [
      { label: "Shop overview", href: "/dashboard", icon: ICONS.dashboard },
      { label: "Reports", href: "/reports", icon: ICONS.reports },
      { label: "Time clock", href: "/time-clock", icon: ICONS.timeClock },
      { label: "Marketing", href: "/marketing", icon: ICONS.marketing },
      { label: "Shop display", href: "/display", icon: ICONS.display },
      { label: "Settings", href: "/settings", icon: ICONS.settings },
    ],
  },
];

/** The rail for one person: no money areas for a technician, owner-only pages for owners. */
export function railGroups(role: string): RailGroup[] {
  const allowed = (row: { money?: boolean; ownerOnly?: boolean }) => (!row.money || role !== "TECH") && (!row.ownerOnly || role === "OWNER");
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(allowed).map((item) => ({ ...item, children: item.children?.filter(allowed) })),
  })).filter((group) => group.items.length > 0);
}
