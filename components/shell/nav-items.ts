import {
  LayoutDashboard,
  UserPlus,
  CalendarDays,
  Users,
  Wrench,
  FileText,
  Receipt,
  ShoppingCart,
  Boxes,
  Megaphone,
  BarChart3,
  Monitor,
  Timer,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  // Leads and Appointments sit ahead of Customers on purpose: the rail now
  // reads front-to-back in the order work actually arrives at a shop —
  // enquiry, booking, customer, ticket.
  { label: "Leads", href: "/leads", icon: UserPlus },
  { label: "Appointments", href: "/appointments", icon: CalendarDays },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Tickets", href: "/tickets", icon: Wrench },
  { label: "Estimates", href: "/estimates", icon: FileText },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "POS", href: "/pos", icon: ShoppingCart },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Marketing", href: "/marketing", icon: Megaphone },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Shop Display", href: "/display", icon: Monitor },
  { label: "Time clock", href: "/time-clock", icon: Timer },
  { label: "Settings", href: "/settings", icon: Settings },
];
