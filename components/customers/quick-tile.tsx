import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * The look of a quick tile on the customer screen: a big soft box with the icon
 * above its label, 80px tall (four sit in a row even on a phone). One class
 * string so the link tiles here and the two menu tiles (Message, More) are the
 * same size and shape. Colours come from theme tokens only.
 */
export const QUICK_TILE_CLASS = cn(
  "flex min-h-20 w-full flex-col items-center justify-start gap-1.5 rounded-2xl border border-border bg-surface-hover px-1 pt-3 text-sm font-semibold text-foreground",
  "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "sm:justify-center sm:px-3 sm:pt-0 sm:text-[15px]",
  "[&_svg]:size-6 [&_svg]:shrink-0 [&_svg]:text-accent-soft-foreground",
);

/** A quick tile that is a plain link. */
export function QuickTile({
  href,
  icon: Icon,
  children,
  className,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} data-touch-control className={cn(QUICK_TILE_CLASS, className)}>
      <Icon aria-hidden />
      <span className="text-center leading-tight">{children}</span>
    </Link>
  );
}
