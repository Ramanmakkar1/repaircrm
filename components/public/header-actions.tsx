"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

/**
 * Sign in and Start free, minus the one that points at the page you are on.
 * Nothing at all on the forced password change, which is reached signed in.
 */
export function HeaderActions() {
  const path = usePathname() ?? "";
  if (path.startsWith("/change-password")) return null;
  const onLogin = path === "/login" || path.startsWith("/login/");
  const onSignup = path === "/signup";

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-3">
      {onLogin ? null : (
        <Link
          href="/login"
          className="inline-flex min-h-12 items-center gap-0.5 rounded-full px-2 text-sm font-semibold text-(--site-accent-ink) hover:text-(--site-ink)"
        >
          Sign in
          <ChevronRight aria-hidden="true" className="hidden size-3.5 sm:block" />
        </Link>
      )}
      {onSignup ? null : (
        <Link
          href="/signup"
          className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-(--site-accent-fill) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--site-accent-ink) sm:px-5"
        >
          Start free
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </div>
  );
}
