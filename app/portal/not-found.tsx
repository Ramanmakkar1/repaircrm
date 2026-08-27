import Link from "next/link";
import { SearchX } from "lucide-react";

import { PortalCard } from "./_components/shell";

/**
 * Shown when a portal detail page's scoped lookup finds nothing.
 *
 * Note that "doesn't exist" and "belongs to somebody else" land here as the same
 * screen, because the queries filter on the cookie's customer — there is no
 * variant of this page that would tell a stranger their guess was close.
 */
export default function PortalNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-12 text-foreground">
      <PortalCard className="w-full max-w-md px-6 py-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-hover text-muted-foreground">
          <SearchX className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight">
          We couldn&apos;t find that
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          The page you were looking for isn&apos;t on your account. It may have
          been removed, or the link may belong to a different email address.
        </p>
        <Link
          href="/portal/home"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-[14px] font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover"
        >
          Back to your portal
        </Link>
      </PortalCard>
    </div>
  );
}
