"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import { RepairPilotMark, RepairPilotWordmark } from "@/components/brand/repairpilot";
import { SearchTrigger } from "@/components/search/search-trigger";
import { cn } from "@/components/ui/cn";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocationSwitcher, type SwitcherLocation } from "./location-switcher";
import { NAV_ITEMS } from "./nav-items";
import type { Density, Theme } from "@/lib/prefs";
import { UserMenu, type CurrentUser } from "./user-menu";
import { SimpleModeButton } from "@/components/counter/simple-mode-button";

const PRIMARY = new Set(["/dashboard", "/pos", "/customers", "/inventory"]);
const OWNER_TOOLS = new Set(["/pos/drawers", "/inventory/vendors", "/inventory/purchase-orders", "/inventory/import"]);

function isUnder(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

/** The same shop tools, arranged around the five daily destinations. */
export function Topbar({
  user, locations, currentLocationId, onSearchClick, density, theme, simple = false,
}: {
  user: CurrentUser;
  density: Density;
  theme: Theme;
  simple?: boolean;
  locations: SwitcherLocation[];
  currentLocationId: string;
  onSearchClick: () => void;
}) {
  const pathname = usePathname();
  const home = simple ? "/pos" : "/dashboard";
  const branch = locations.find((location) => location.id === currentLocationId);
  const branchLabel = branch?.name ?? (locations.length === 1 ? locations[0].name : "All locations");
  const tabs = [
    { label: "Workbench", href: "/dashboard", active: pathname === "/dashboard" },
    { label: "Sales", href: "/pos", active: isUnder(pathname, "/pos") },
    { label: "Customers", href: "/customers", active: isUnder(pathname, "/customers") },
    { label: "Stock", href: "/inventory", active: isUnder(pathname, "/inventory") },
  ];
  const moreActive = !tabs.some((tab) => tab.active);

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="mx-auto flex min-h-[72px] max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-0 px-4 sm:px-6 xl:gap-x-6 xl:px-12">
        <div className="flex min-w-0 items-center gap-2 py-3 sm:min-w-48">
          <Link href={home} aria-label="Repairs helper home" className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RepairPilotMark className="size-9" />
          </Link>
          <div className="min-w-0">
            <Link href={home} className="block truncate text-sm leading-5 text-foreground">
              <RepairPilotWordmark />
            </Link>
            {locations.length > 1 ? <LocationSwitcher locations={locations} currentId={currentLocationId} compact /> : <p className="truncate text-xs leading-5 text-muted-foreground">{branchLabel}</p>}
          </div>
        </div>

        <nav aria-label="Primary navigation" className="order-last flex w-full items-center gap-5 overflow-x-auto text-sm font-medium sm:gap-6 lg:order-none lg:w-auto">
          {tabs.map((tab) => (
            simple && tab.href === "/dashboard" ? (
              <SimpleModeButton key={tab.href} on={false} variant="ghost" className="h-11 shrink-0 rounded-sm px-0 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground lg:h-10">Workbench</SimpleModeButton>
            ) : (
            <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined}
              className={cn("flex h-11 shrink-0 items-center whitespace-nowrap rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10", tab.active ? "text-accent-soft-foreground" : "text-muted-foreground hover:text-foreground")}>
              {tab.label}
            </Link>
            )
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("flex h-11 shrink-0 items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10", moreActive ? "text-accent-soft-foreground" : "text-muted-foreground hover:text-foreground")}>
                More <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[min(70dvh,600px)] w-64 overflow-y-auto">
              <DropdownMenuLabel>All shop tools</DropdownMenuLabel>
              <DropdownMenuItem asChild><Link href="/counter">All tools & quick actions</Link></DropdownMenuItem>
              {NAV_ITEMS.filter((item) => !PRIMARY.has(item.href)).map((item) => (
                <DropdownMenuItem asChild key={item.href}><Link href={item.href} aria-current={isUnder(pathname, item.href) ? "page" : undefined}><item.icon className="size-4 text-muted-foreground" />{item.label}</Link></DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>More in Sales, Customers & Stock</DropdownMenuLabel>
              {NAV_ITEMS.flatMap((item) => item.children ?? []).filter((child) => (user.role === "OWNER" || !OWNER_TOOLS.has(child.href)) && (child.href !== "/customers/import" || user.role !== "TECH")).map((child) => (
                <DropdownMenuItem asChild key={child.href}><Link href={child.href}>{child.label === "Import" ? `${child.href.startsWith("/customers") ? "Customer" : "Stock"} import` : child.label}</Link></DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 sm:w-48 xl:w-[280px]"><SearchTrigger onOpen={onSearchClick} /></div>
          <Link href={simple ? "/tickets?due=overdue" : "/dashboard#attention"} aria-label="Repairs needing attention" title="Repairs needing attention" className="hidden size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"><Bell className="size-5" aria-hidden /></Link>
          <UserMenu user={user} density={density} theme={theme} simple={simple} />
        </div>
      </div>
    </header>
  );
}
