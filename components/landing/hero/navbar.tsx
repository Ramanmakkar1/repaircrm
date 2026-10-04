"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Menu, X } from "lucide-react";

import { BrandMark } from "../brand";

/** Where the website links go. Kept as data so tests (and the footer) can read them. */
export const NAV_ITEMS = [
  { label: "Home", href: "#top", current: true },
  { label: "Product", href: "#product" },
  { label: "AI assistant", href: "#assistant" },
  { label: "Pricing", href: "#pricing" },
] as const;
export const SIGN_IN_HREF = "/login";
export const SIGN_UP_HREF = "/signup";

const item =
  "inline-flex min-h-11 items-center rounded-full px-3 text-sm text-neutral-900 transition-colors hover:bg-neutral-100 md:min-h-9 md:px-1 md:hover:bg-transparent md:hover:text-black";

/** In-page anchors are plain links; real routes use next/link. */
function NavLink({
  href,
  className,
  onClick,
  current,
  children,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  current?: boolean;
  children: ReactNode;
}) {
  const props = { className, onClick, "aria-current": current ? ("page" as const) : undefined };
  return href.startsWith("#") ? (
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
 * Floating white pill. Under `md` the links collapse into a hamburger that
 * opens a panel under the pill; it closes on a link click, on Escape (focus
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
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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
    <div className="flex justify-center px-3 pt-4 sm:px-4 sm:pt-6">
      <nav
        ref={wrapRef}
        aria-label="Main"
        className="relative flex w-full max-w-[760px] items-center rounded-full border border-neutral-200 bg-white py-2 pl-2 pr-2 shadow-sm"
      >
        <a
          href="#top"
          aria-label="Repairs helper home"
          className="flex h-11 shrink-0 items-center rounded-full px-1.5 sm:h-10"
        >
          <BrandMark priority className="h-7 w-7 sm:h-8 sm:w-8" />
        </a>

        <ul className="hidden items-center gap-6 pl-5 md:flex">
          {NAV_ITEMS.map((link) => (
            <li key={link.label}>
              <NavLink href={link.href} className={item} current={"current" in link}>
                {"current" in link ? (
                  <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 rounded-full bg-black" />
                ) : null}
                {link.label}
              </NavLink>
            </li>
          ))}
          <li>
            <Link
              href={SIGN_IN_HREF}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-1 text-sm font-medium text-(--site-accent-ink)"
            >
              Sign in
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </li>
        </ul>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href={SIGN_UP_HREF}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-(--site-accent-fill) py-1.5 pl-4 pr-1.5 text-sm font-semibold text-white transition-[filter] hover:brightness-95 sm:min-h-10 sm:pl-5"
          >
            Start free
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20"
            >
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
          <button
            ref={buttonRef}
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 hover:bg-neutral-100 md:hidden"
          >
            {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>

        <div
          id={panelId}
          hidden={!open}
          className="absolute left-2 right-2 top-full z-20 mt-2 rounded-2xl border border-neutral-200 bg-white p-3 shadow-lg md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((link) => (
              <li key={link.label}>
                <NavLink
                  href={link.href}
                  onClick={close}
                  current={"current" in link}
                  className={`${item} w-full`}
                >
                  {"current" in link ? (
                    <span aria-hidden="true" className="mr-2 h-1.5 w-1.5 rounded-full bg-black" />
                  ) : null}
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li>
              <Link
                href={SIGN_IN_HREF}
                onClick={close}
                className="inline-flex min-h-11 w-full items-center gap-1 rounded-full px-3 text-sm font-medium text-(--site-accent-ink) hover:bg-neutral-100"
              >
                Sign in
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  );
}
