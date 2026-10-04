"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/components/ui/cn";
import { HOME_TAB_COOKIE } from "./home-tab-cookie";

export type HomeTab = {
  key: string;
  /** Full name, announced to screen readers and shown from the sm breakpoint up. */
  label: string;
  /** Shorter name for phone widths, where three tabs share one row. */
  short: string;
  icon: React.ReactNode;
  content: React.ReactNode;
};

/**
 * Register-style group tabs: one big tab per area of the shop, and only that
 * area's tiles on screen. Switching is instant (the panels are server-rendered
 * and passed in), and the last tab is remembered per device in a cookie so
 * coming Home from Stock lands back on Stock rather than on Counter.
 */
export function HomeTabs({ tabs, initial }: { tabs: HomeTab[]; initial: string }) {
  const [value, setValue] = React.useState(tabs.some((tab) => tab.key === initial) ? initial : tabs[0].key);

  const change = (next: string) => {
    setValue(next);
    try {
      document.cookie = `${HOME_TAB_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // A blocked cookie only means Home opens on Counter next time.
    }
  };

  return (
    <TabsPrimitive.Root value={value} onValueChange={change} className="flex min-w-0 flex-col gap-4">
      <TabsPrimitive.List aria-label="Areas of the shop" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-surface-hover p-1.5">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.key}
            value={tab.key}
            aria-label={tab.label}
            className={cn(
              "flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 text-base font-semibold leading-tight text-muted-foreground transition-colors sm:px-4",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm",
            )}
          >
            <span aria-hidden className="hidden shrink-0 sm:block">{tab.icon}</span>
            <span aria-hidden className="sm:hidden">{tab.short}</span>
            <span aria-hidden className="hidden sm:inline">{tab.label}</span>
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content key={tab.key} value={tab.key} className="focus-visible:outline-none">
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
