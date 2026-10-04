import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";

import { PublicShell } from "@/components/public/shell";
import { cn } from "@/components/ui/cn";
import type { PublicShop } from "@/lib/portal-display";

/**
 * Chrome for the customer portal.
 *
 * Lives in a component rather than a layout so the print route under
 * /portal/invoices/[id]/print can opt out of it entirely: a layout would be
 * inherited, and a sheet of paper must not carry a sign-out button.
 *
 * The frame itself is the shared public one (components/public/shell.tsx), so
 * the portal, the check-in desk and the shop page introduce the shop the same
 * way and all end with its phone number, directions and hours.
 */
export function PortalShell({
  shop,
  customerName,
  children,
  wide = false,
  hideContact = false,
}: {
  shop: PublicShop;
  customerName?: string | null;
  children: React.ReactNode;
  wide?: boolean;
  hideContact?: boolean;
}) {
  return (
    <PublicShell
      shop={shop}
      eyebrow={customerName ? `Your repairs · ${customerName}` : "Your repairs"}
      homeHref="/portal/home"
      width={wide ? "lg" : "md"}
      hideContact={hideContact}
      actions={
        customerName ? (
          <Link
            href="/portal/logout"
            prefetch={false}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Link>
        ) : null
      }
    >
      {children}
    </PublicShell>
  );
}

/** The rounded card a portal section sits in. */
export function PortalCard({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-2xl border border-border bg-surface", className)} {...props} />;
}

/** A section title with an optional one-line description and a trailing action. */
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {description ? <p className="mt-1 text-[15px] text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** "Back to your repairs": a 48px target, not a 20px line of text. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 mb-4 inline-flex min-h-12 items-center gap-2 rounded-xl px-1 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-5" aria-hidden />
      {children}
    </Link>
  );
}

/** Label/value pair used across the detail pages. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-[15px] text-muted-foreground sm:px-6">{children}</div>;
}
