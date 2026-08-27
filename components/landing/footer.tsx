import Link from "next/link";

import { WrenchIcon } from "./icons";

/**
 * The year is computed on the server at render time. The landing page is
 * already dynamic (it reads the session cookie to decide whether to redirect),
 * so this never bakes a stale year into a static build.
 */
export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface-hover/50">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
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
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
              Built for repair shops — phone and tablet, computer, console,
              mail-in and on-site IT.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-3 sm:items-end">
            <a
              href="#features"
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              FAQ
            </a>
            <Link
              href="/login"
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-[14px] font-semibold text-accent transition-colors hover:text-accent-hover"
            >
              Start free
            </Link>
          </nav>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-[13px] text-faint-foreground">
            © {year} RepairFlow
          </p>
        </div>
      </div>
    </footer>
  );
}
