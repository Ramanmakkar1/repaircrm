import Link from "next/link";

import {
  RepairPilotMark,
  RepairPilotWordmark,
} from "@/components/brand/repairpilot";

/** Footer links at the public 48px touch size. */
const FOOTER_LINK =
  "inline-flex min-h-12 items-center rounded-md px-1 font-medium hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rf-landing min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="flex min-h-12 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <RepairPilotMark className="size-9" />
            <RepairPilotWordmark className="text-base text-foreground" />
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-12 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
          >
            Start free
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {intro}
        </p>

        <article className="mt-14 space-y-10 text-[15px] leading-7 text-muted-foreground [&_a]:font-semibold [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:pl-1 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
          {children}
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-6 text-[15px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} Repairs helper</p>
          <nav aria-label="Legal" className="flex gap-3">
            <Link href="/privacy" className={FOOTER_LINK}>
              Privacy
            </Link>
            <Link href="/terms" className={FOOTER_LINK}>
              Terms
            </Link>
            <Link href="/portal" className={FOOTER_LINK}>
              Check your repair
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
