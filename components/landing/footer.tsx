import Link from "next/link";

import { RepairPilotWordmark } from "@/components/brand/repairpilot";

import { BrandMark } from "./brand";

/**
 * The year is computed on the server at render time. The landing page is
 * already dynamic (it reads the session cookie to decide whether to redirect),
 * so this never bakes a stale year into a static build.
 */

export const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Check-in & repairs", href: "#check-in" },
      { label: "Payments", href: "#payments" },
      { label: "Stock pictures", href: "#stock" },
      { label: "AI assistant", href: "#assistant" },
    ],
  },
  {
    title: "Shop",
    links: [
      { label: "Sign in", href: "/login" },
      // Customers land on this page too, usually chasing their own repair.
      { label: "Check your repair", href: "/portal" },
      { label: "Pricing", href: "#pricing" },
      { label: "Questions", href: "#faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
] as const;

const link =
  "inline-flex min-h-9 items-center text-[15px] text-neutral-700 transition-colors hover:text-black";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer rounded-2xl bg-(--site-tray) px-5 py-12 sm:rounded-3xl sm:px-10 sm:py-14 lg:px-16">
      <div className="mx-auto max-w-[1120px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <a href="#top" className="inline-flex items-center gap-2.5">
              <BrandMark className="size-10" />
              <RepairPilotWordmark className="text-xl text-neutral-900" />
            </a>
            <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-neutral-700">
              Made for independent repair shops: phones, computers, consoles, TVs and drones.
            </p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={`Footer ${group.title.toLowerCase()}`}>
              <p className="text-[13px] font-semibold text-neutral-900">{group.title}</p>
              <ul className="mt-2">
                {group.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("#") ? (
                      <a href={l.href} className={link}>
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className={link}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-neutral-300/70 pt-6 text-[13px] text-neutral-600 sm:flex-row sm:justify-between">
          <span>© {year} Repairs helper · Townmedia Labs</span>
          <span>Free during early access</span>
        </div>
      </div>
    </footer>
  );
}
