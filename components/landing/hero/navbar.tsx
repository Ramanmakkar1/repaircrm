"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Menu, X } from "lucide-react";

import { RepairPilotWordmark } from "@/components/brand/repairpilot";
import { BrandMark } from "../brand";

/**
 * Where the website links go. Kept as data so tests (and the footer) can read them.
 * Hrefs are root-relative ("/#product", not "#product") so the same bar works
 * on every public page, not just the home page.
 */
export const NAV_ITEMS = [
  { label: "Product", href: "/#product" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Compare", href: "/compare/repairshopr-alternative" },
  { label: "Contact", href: "/contact" },
] as const;
export const SIGN_IN_HREF = "/login";
export const SIGN_UP_HREF = "/signup";

const item =
  "inline-flex min-h-11 items-center rounded-full px-3 text-sm text-neutral-900 transition-colors hover:bg-neutral-100 lg:min-h-9 lg:px-1 lg:hover:bg-transparent lg:hover:text-black";

/** Links with a #fragment are plain anchors (native scrolling); routes use next/link. */
function NavLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const props = { className, onClick };
  return href.includes("#") ? (
    <a href={href} {...props}>
      {children}
    </a>
  ) : (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

/**
 * Responsive brand navigation, sticky at the top of the page. Under `lg` the links collapse into a hamburger that
 * opens a panel under the navigation; it closes on a link click, on Escape (focus
 * returns to the button) and on a click outside.
 */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="site-nav-bar sticky top-0 z-40 flex justify-center border-b border-[#e3e8ef] bg-white px-3 sm:px-4">
      <nav
        ref={wrapRef}
        aria-label="Main"
        className="site-navbar relative flex w-full max-w-[1280px] items-center py-2"
      >
        <Link
          href="/"
          aria-label="Repairs helper home"
          className="site-nav-brand flex h-11 shrink-0 items-center gap-2"
        >
          <BrandMark priority className="h-9 w-9 sm:h-10 sm:w-10" />
          <RepairPilotWordmark className="text-lg" />
        </Link>

        <ul className="hidden items-center gap-6 pl-10 lg:flex">
          {NAV_ITEMS.map((link) => (
            <li key={link.label}>
              <NavLink href={link.href} className={item}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Visible at every width: returning shops should not have to open a menu to sign in. */}
          <Link
            href={SIGN_IN_HREF}
            className="inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-(--site-accent-ink) hover:bg-neutral-100 sm:px-3"
          >
            Sign in
          </Link>
          <Link
            href={SIGN_UP_HREF}
            className="site-button site-nav-cta !min-h-11 !py-2"
          >
            Start free
            <ChevronRight aria-hidden="true" className="site-nav-cta-icon h-4 w-4" />
          </Link>
          <button
            ref={buttonRef}
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 hover:bg-neutral-100 lg:hidden"
          >
            {open ? (
              <X aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>

        <div
          id={panelId}
          hidden={!open}
          className="absolute left-2 right-2 top-full z-20 mt-2 rounded-2xl border border-neutral-200 bg-white p-3 shadow-lg lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((link) => (
              <li key={link.label}>
                <NavLink
                  href={link.href}
                  onClick={close}
                  className={`${item} w-full`}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
