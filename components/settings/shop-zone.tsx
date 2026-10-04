"use client";

import * as React from "react";

/**
 * The shop's time zone for every date shown under Settings. Set once by the
 * settings shell from `Shop.timezone`; read by any card that prints a time.
 */
const ShopZoneContext = React.createContext<string>("UTC");

export function ShopZoneProvider({ zone, children }: { zone: string; children: React.ReactNode }) {
  return <ShopZoneContext.Provider value={zone || "UTC"}>{children}</ShopZoneContext.Provider>;
}

export function useShopZone(): string {
  return React.useContext(ShopZoneContext);
}

/**
 * "Now", fixed when the screen first renders: enough to say Today / Yesterday
 * and "11 minutes ago" without a clock ticking through every render.
 */
export function useRenderedAt(): number {
  const [now] = React.useState(() => Date.now());
  return now;
}
