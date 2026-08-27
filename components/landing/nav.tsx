import Link from "next/link";

import { Button } from "@/components/ui/button";
import { WrenchIcon } from "./icons";

/**
 * The marketing header reuses the exact brand block from the app rail
 * (components/shell/brand.tsx): same 36px indigo square, same wrench, same
 * two-line lockup — so arriving in the product after signing up feels like the
 * same building, not a different one.
 *
 * Anchor links collapse below `sm`; the two CTAs never do, because on a phone
 * they are the only thing in the header that matters.
 */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md py-1.5 pr-2 transition-colors"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-xs">
            <WrenchIcon className="size-[18px]" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight text-foreground">
              RepairFlow
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Repair shop
            </span>
          </span>
        </Link>

        <nav
          aria-label="Page sections"
          className="ml-6 hidden items-center gap-1 sm:flex"
        >
          {[
            { href: "#features", label: "Features" },
            { href: "#pricing", label: "Pricing" },
            { href: "#faq", label: "FAQ" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Start free</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
