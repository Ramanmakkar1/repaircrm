import {
  LayoutDashboard,
  Users,
  Wrench,
  FileText,
  Receipt,
  ShoppingCart,
  Boxes,
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
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Tickets", href: "/tickets", icon: Wrench },
  { label: "Estimates", href: "/estimates", icon: FileText },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "POS", href: "/pos", icon: ShoppingCart },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Settings", href: "/settings", icon: Settings },
];
