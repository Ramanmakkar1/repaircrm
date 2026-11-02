import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";

import { platformLogoutAction } from "@/app/platform/actions";
import { RepairPilotMark } from "@/components/brand/repairpilot";

export type ConsoleSection = "overview" | "shops" | "activity" | "feedback" | "system";

const SECTIONS: ReadonlyArray<{ key: ConsoleSection; label: string; href: string }> = [
  { key: "overview", label: "Overview", href: "/platform" },
  { key: "shops", label: "Shops", href: "/platform/shops" },
  { key: "activity", label: "Activity", href: "/platform/activity" },
  { key: "feedback", label: "Feedback", href: "/platform/feedback" },
  { key: "system", label: "System health", href: "/platform/system" },
];

/**
 * The operator console's frame: its own header and tabs, nothing from the shop
 * app (no rail, no location switcher, no assistant) and no link into any
 * shop's workspace. A server component with the current tab passed in, so it
 * needs no router hook and renders the same in tests.
 */
export function ConsoleShell({
  admin,
  current,
  children,
}: {
  admin: { name?: string; email?: string };
  current: ConsoleSection;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 sm:px-6">
          <Link
            href="/platform"
            className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <RepairPilotMark className="size-9" />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight tracking-tight">Repairs helper</span>
              <span className="block text-xs leading-tight text-muted-foreground">Operator console</span>
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            {admin.email ? (
              <span className="hidden min-w-0 items-center gap-1.5 truncate text-muted-foreground sm:inline-flex">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-status-resolved" />
                <span className="truncate">{admin.email}</span>
              </span>
            ) : null}
            <form action={platformLogoutAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Console sections" className="mx-auto max-w-[1280px] px-2 sm:px-4">
          {/* Wraps rather than scrolls on a phone, so no tab hides off the edge. */}
          <ul className="flex flex-wrap gap-x-1">
            {SECTIONS.map((section) => (
              <li key={section.key} className="shrink-0">
                <Link
                  href={section.href}
                  aria-current={section.key === current ? "page" : undefined}
                  className="inline-flex min-h-12 items-center border-b-2 border-transparent px-3 text-[15px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
