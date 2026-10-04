import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/components/ui/cn";

/** The one emphasised word (or two) in a heading: Instrument Serif italic. */
export function Serif({ children }: { children: ReactNode }) {
  return <span className="site-serif">{children}</span>;
}

/**
 * A rounded-3xl panel on the grey page frame. `white` or the warm `tray`;
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
        "relative scroll-mt-4 overflow-hidden rounded-2xl px-5 py-14 sm:rounded-3xl sm:px-10 sm:py-20 lg:px-16 lg:py-24",
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
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center gap-3 rounded-full bg-[#0b0f1a] py-2 pl-6 pr-2 text-sm font-medium text-white sm:py-2.5 sm:pl-7",
        className,
      )}
    >
      {children}
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 sm:h-7 sm:w-7"
      >
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** A small orange dot used as a list marker. */
export function Dot() {
  return <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-(--site-accent)" />;
}
