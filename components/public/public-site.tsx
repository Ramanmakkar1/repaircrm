import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { RepairPilotWordmark } from "@/components/brand/repairpilot";
import { BrandMark } from "@/components/landing/brand";
import { cn } from "@/components/ui/cn";
import { HeaderActions } from "./header-actions";
import { PUBLIC_SCOPE } from "./scope";

/**
 * The frame for every signed-out page that is not the landing page: sign in,
 * create a shop, password help, feedback, Privacy, Terms, the 404 and the
 * customer portal's front door. Same type, pill buttons, header and footer as
 * the landing page, so leaving "/" never feels like leaving the product.
 *
 * The landing page's own Navbar and Footer are built around in-page anchors
 * (#top, #features), so this keeps its own pair pointing back at "/".
 */

export const SUPPORT_EMAIL = "support@repairshelper.com";

export function PublicSite({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  /** Right side of the header. Default: Sign in and Start free. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(PUBLIC_SCOPE, "flex min-h-dvh w-full flex-1 flex-col bg-white text-(--site-ink)", className)}>
      <a href="#main" className="public-skip">
        Skip to content
      </a>
      <PublicHeader actions={actions} />
      <main id="main" className="flex w-full flex-1 flex-col">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

const NAV = [
  { label: "Product", href: "/#product" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Compare", href: "/compare/repairshopr-alternative" },
  { label: "Contact", href: "/contact" },
] as const;

export function PublicHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="w-full px-4 pt-3 sm:px-8 sm:pt-5">
      <nav aria-label="Main" className="mx-auto flex w-full max-w-[1280px] items-center gap-3 py-2">
        <Link href="/" aria-label="Repairs helper home" className="mr-auto flex min-h-12 shrink-0 items-center gap-2 rounded-lg">
          <BrandMark priority className="size-9 sm:size-10" />
          <RepairPilotWordmark className="text-[17px] sm:text-lg" />
        </Link>
        <ul className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="inline-flex min-h-12 items-center text-sm text-neutral-900 hover:text-black hover:underline underline-offset-4">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-1 justify-end lg:flex-none lg:pl-10">{actions === undefined ? <HeaderActions /> : actions}</div>
      </nav>
    </header>
  );
}

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Early-access pricing", href: "/pricing" },
      { label: "Compare with RepairShopr", href: "/compare/repairshopr-alternative" },
      { label: "Contact", href: "/contact" },
      { label: "Common questions", href: "/#faq" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Create your shop", href: "/signup" },
      { label: "Sign in", href: "/login" },
      { label: "Check your repair", href: "/portal" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Report an issue or idea", href: "/feedback" },
      { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
      // Reachable signed out, from inside the iOS / Android app too (App Store
      // 5.1.1(v), Google Play account-deletion policy).
      { label: "Delete your account", href: "/delete-account" },
    ],
  },
] as const;

const FOOTER_LINK =
  "inline-flex min-h-11 items-center text-sm text-(--site-muted) [overflow-wrap:anywhere] hover:text-(--site-accent-ink) hover:underline underline-offset-4";

export function PublicFooter() {
  return (
    <footer className="mt-auto w-full border-t border-(--site-line) bg-(--site-tray) px-4 pt-12 pb-6 sm:px-8 sm:pt-14">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="grid gap-10 pb-10 lg:grid-cols-[1fr_1.8fr] lg:gap-20">
          <div>
            <Link href="/" className="inline-flex min-h-12 items-center gap-2.5 rounded-lg">
              <BrandMark className="size-10" />
              <RepairPilotWordmark className="text-xl" />
            </Link>
            <p className="mt-4 max-w-sm text-[15px] leading-7 text-(--site-muted)">
              Repairs, sales, stock and an AI helper for independent phone, computer and device repair shops.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
            {FOOTER_GROUPS.map((group) => (
              <nav
                key={group.title}
                aria-label={`Footer ${group.title.toLowerCase()}`}
                className={cn("min-w-0", group.title === "Help" && "col-span-2 sm:col-span-1")}
              >
                <h2 className="mb-2 text-sm font-bold text-(--site-ink)">{group.title}</h2>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("mailto:") ? (
                        <a href={link.href} className={FOOTER_LINK}>
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className={FOOTER_LINK}>
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-(--site-line) pt-5 text-[13px] text-(--site-muted) md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          <span>© {new Date().getFullYear()} Repairs helper · Town Media Labs, Edmonton, Alberta, Canada</span>
          <span>Free during early access. No credit card needed.</span>
          <a
            href="https://kiwitechlabs.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 hover:text-(--site-ink)"
          >
            <Image src="/assets/brand/kiwitechlabs-logo.webp" width={24} height={24} alt="" unoptimized />
            <span>
              Designed by <strong className="font-semibold">kiwitechlabs.com</strong>
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}

/** An inline text link with a 44px hit area that does not break the line. */
export const INLINE_LINK = "public-inline-link";
