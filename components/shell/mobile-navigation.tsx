"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, Home, Package, ShoppingBag, Users, Wrench } from "lucide-react";
import { OPEN_SHOP_ASSISTANT } from "@/components/assistant/assistant-events";
import { countLabel } from "@/components/counter/attention";
import { cn } from "@/components/ui/cn";
import { useAttention } from "./attention-provider";

type Tab = { key: string; label: string; href: string; Icon: typeof Home; /** Other areas that live under this tab. */ also?: string[] };

/**
 * Which tab a screen belongs to. Every screen lights exactly one tab, so the
 * person always knows where they are: screens reached from Home (Customers,
 * Reports, Settings...) light Home, and the money screens light Sell.
 */
export function activeTab(tabs: readonly Tab[], path: string): string {
  const under = (href: string) => path === href || path.startsWith(`${href}/`);
  const hit = tabs.find((tab) => tab.href !== "/counter" && [tab.href, ...(tab.also ?? [])].some(under));
  return hit?.key ?? "home";
}

export function phoneTabs(role: string): Tab[] {
  return [
    { key: "home", label: "Home", href: "/counter", Icon: Home },
    { key: "repairs", label: "Repairs", href: "/tickets", Icon: Wrench, also: ["/appointments"] },
    role === "TECH"
      ? { key: "customers", label: "Customers", href: "/customers", Icon: Users, also: ["/leads"] }
      : { key: "sell", label: "Sell", href: "/pos", Icon: ShoppingBag, also: ["/invoices", "/estimates"] },
    { key: "stock", label: "Stock", href: "/inventory", Icon: Package },
  ];
}

export function MobileNavigation({ role }: { role: string }) {
  const path = usePathname();
  const attention = useAttention();
  const total = attention?.total ?? 0;
  const tabs = phoneTabs(role);
  const current = activeTab(tabs, path);
  // Side padding clears a landscape notch; in portrait the inset is 0, so it stays 0.5rem.
  return <nav aria-label="App navigation" className="grid shrink-0 grid-cols-5 border-t border-border bg-surface pl-[max(.5rem,env(safe-area-inset-left))] pr-[max(.5rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden">
    {tabs.map(({ key, label, href, Icon }) => {
      const active = key === current;
      // Home carries the "Needs you" number: Home is where that list lives.
      const badge = key === "home" && total > 0 ? total : 0;
      // The current tab is shown by shape as well as colour: a bar on top and a heavier icon, in both themes.
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} aria-label={badge ? `${label}, ${countLabel(badge)} need you` : undefined} className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "text-foreground" : "text-muted-foreground")}>
        {active ? <span aria-hidden className="absolute inset-x-4 top-0 h-[3px] rounded-full bg-current" /> : null}
        <span className="relative">
          <Icon className="size-6" strokeWidth={active ? 2.75 : 2} aria-hidden />
          {badge ? <span aria-hidden className="absolute -right-3.5 -top-2 min-w-5 rounded-full bg-destructive px-1 py-px text-center text-[11px] font-bold leading-4 tabular-nums text-destructive-foreground">{countLabel(badge)}</span> : null}
        </span>
        {label}
      </Link>;
    })}
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHOP_ASSISTANT))} aria-haspopup="dialog" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-[12.5px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><AudioLines className="size-6" aria-hidden />Ask</button>
  </nav>;
}
