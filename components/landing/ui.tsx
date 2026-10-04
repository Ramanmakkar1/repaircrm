import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/components/ui/cn";

/** Inline heading phrase, using the same typeface as its surrounding heading. */
export function Serif({ children }: { children: ReactNode }) {
  return <span className="site-serif">{children}</span>;
}

/**
 * A full-width section. `white` or the cool slate `tray`;
 * sections alternate between the two so the page keeps its rhythm.
 */
export function Panel({
  id,
  labelledBy,
  tone = "white",
  className,
  children,
}: {
  id?: string;
  labelledBy: string;
  tone?: "white" | "tray";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "site-panel relative scroll-mt-4 overflow-hidden rounded-2xl px-5 py-14 sm:rounded-3xl sm:px-10 sm:py-20 lg:px-16 lg:py-24",
        tone === "white" ? "bg-white" : "bg-(--site-tray)",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The dark pill used for every primary action, same anatomy as the hero button. */
export function DarkCta({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("site-button", className)}>
      {children}
      <ChevronRight aria-hidden="true" className="h-4 w-4" />
    </Link>
  );
}

/** A small brand-blue dot used as a list marker. */
export function Dot() {
  return (
    <span
      aria-hidden="true"
      className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-(--site-accent)"
    />
  );
}
