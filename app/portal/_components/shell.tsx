import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * Chrome for the customer portal.
 *
 * Lives in a component rather than a layout so the print route under
 * /portal/invoices/[id]/print can opt out of it entirely — a layout would be
 * inherited, and a sheet of paper must not carry a sign-out button.
 *
 * The portal is for people who are anxious about their laptop, on a phone, in a
 * hurry. So: one column, large type, chunky cards, no density tricks.
 */

export function PortalShell({
  shopName,
  customerName,
  children,
  wide = false,
}: {
  shopName: string;
  customerName?: string | null;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div
          className={cn(
            "mx-auto flex items-center justify-between gap-4 px-5 py-4",
            wide ? "max-w-4xl" : "max-w-3xl",
          )}
        >
          <Link href="/portal/home" className="min-w-0">
            <div className="truncate text-[17px] font-bold tracking-tight">
              {shopName}
            </div>
            <div className="text-[13px] text-muted-foreground">
              Customer portal
            </div>
          </Link>

          {customerName ? (
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-[13px] text-muted-foreground sm:inline">
                {customerName}
              </span>
              <Link
                href="/portal/logout"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <LogOut className="size-4" />
                Sign out
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full px-5 py-8 sm:py-10",
          wide ? "max-w-4xl" : "max-w-3xl",
        )}
      >
        {children}
      </main>

      <footer className="mx-auto max-w-3xl px-5 pb-10 text-center text-[13px] text-muted-foreground">
        Questions? Just reply to the email we sent you, or give {shopName} a
        call.
      </footer>
    </div>
  );
}

/** The big rounded card everything on the portal sits in. */
export function PortalCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function PortalCardHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}

/** Label/value pair used across the detail pages. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-[14px] text-foreground">{children}</dd>
    </div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-8 text-center text-[14px] text-muted-foreground sm:px-6">
      {children}
    </div>
  );
}
