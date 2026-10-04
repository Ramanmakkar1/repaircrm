import Link from "next/link";
import { ShoppingCart, Wrench } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * The top of the overview: a warm greeting, where and when, and the two jobs
 * that happen all day as the two big buttons (New repair first, New sale second),
 * the same pair as on Home.
 */
export function OverviewHeader({
  greeting,
  firstName,
  shopName,
  branchName,
  dateLabel,
}: {
  greeting: string;
  firstName: string;
  shopName: string;
  branchName: string | null;
  dateLabel: string;
}) {
  const place = branchName ? `${shopName} · ${branchName}` : shopName;
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
        <p className="mt-0.5 text-base text-muted-foreground">
          <span className="font-semibold text-foreground">Shop overview</span> · {place} · {dateLabel}
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
        <BigLink href="/tickets/new" icon={Wrench} primary>
          New repair
        </BigLink>
        <BigLink href="/pos" icon={ShoppingCart}>
          New sale
        </BigLink>
      </div>
    </header>
  );
}

function BigLink({ href, icon: Icon, primary, children }: { href: string; icon: typeof Wrench; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      data-touch-control
      className={cn(
        // nowrap + a tighter phone padding: "New repair" must stay on one line in a half-width button at 390px.
        "inline-flex h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-3 text-lg font-semibold sm:min-w-44 sm:gap-2.5 sm:px-6",
        "transition-[background-color,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        primary ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "border-2 border-accent bg-surface text-foreground hover:bg-surface-hover",
      )}
    >
      <Icon className="size-6" aria-hidden />
      {children}
    </Link>
  );
}
