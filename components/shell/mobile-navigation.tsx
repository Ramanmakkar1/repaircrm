"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, Home, Package, ShoppingBag, Users, Wrench } from "lucide-react";
import { OPEN_SHOP_ASSISTANT } from "@/components/assistant/assistant-events";
import { cn } from "@/components/ui/cn";

export function MobileNavigation({ role }: { role: string }) {
  const path = usePathname();
  const tabs = [
    { label: "Home", href: "/counter", Icon: Home },
    { label: "Repairs", href: "/tickets", Icon: Wrench },
    role === "TECH" ? { label: "Customers", href: "/customers", Icon: Users } : { label: "Sales", href: "/pos", Icon: ShoppingBag },
    { label: "Stock", href: "/inventory", Icon: Package },
  ];
  // Side padding clears a landscape notch; in portrait the inset is 0, so it stays 0.5rem.
  return <nav aria-label="App navigation" className="grid shrink-0 grid-cols-5 border-t border-border bg-surface pl-[max(.5rem,env(safe-area-inset-left))] pr-[max(.5rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden">
    {tabs.map(({ label, href, Icon }) => {
      const active = path === href || path.startsWith(`${href}/`);
      // The current tab is shown by shape as well as colour: a bar on top and a heavier icon, in both themes.
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "text-accent-soft-foreground" : "text-muted-foreground")}>{active ? <span aria-hidden className="absolute inset-x-4 top-0 h-[3px] rounded-full bg-current" /> : null}<Icon className="size-5" strokeWidth={active ? 2.75 : 2} aria-hidden />{label}</Link>;
    })}
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHOP_ASSISTANT))} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><AudioLines className="size-5" aria-hidden />Assistant</button>
  </nav>;
}
