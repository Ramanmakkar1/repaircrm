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
 * Put a <Container> inside for the content column.
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
        "site-panel relative scroll-mt-4 overflow-hidden py-16 sm:py-20 lg:py-24",
        tone === "white" ? "bg-white" : "bg-(--site-tray)",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * The same column every other landing section uses (.site-container): 20px
 * gutters on phones, 32px from 768px, at most 1280px wide. Tailwind classes, so
 * it also works on pages that do not load site.css.
 */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("mx-auto w-[calc(100%-40px)] max-w-[1280px] md:w-[calc(100%-64px)]", className)}>
      {children}
    </div>
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
