"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The sign-in card, centred. Create-a-shop alone gets a second column at
 * 1024px and wider (`aside`) saying what the shop gets; every other screen in
 * the family is one job and stays a single card.
 */
export function AuthFrame({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  const wide = useSelectedLayoutSegment() === "signup";
  return (
    <div
      className={
        wide
          ? "mx-auto grid w-full max-w-md items-center gap-12 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_28rem]"
          : "mx-auto w-full max-w-md"
      }
    >
      {wide ? <div className="hidden lg:block">{aside}</div> : null}
      <div className="rounded-3xl border border-border bg-white p-6 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_12px_32px_-12px_rgb(16_24_40/0.12)] sm:p-8">
        {children}
      </div>
    </div>
  );
}
