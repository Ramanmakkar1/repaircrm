"use client";

import { X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/*
        Desktop rail. It is the same white as the canvas it sits against — the
        single hairline on its right edge is what makes it read as a rail, and
        the brand block's own hairline lines up exactly with the topbar's.
      */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar-bg md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
          <Brand />
        </div>
        <NavLinks />
      </aside>

      {/* mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] transition-opacity md:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!mobileOpen}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar-bg shadow-xl transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-5" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>
        <NavLinks onNavigate={onClose} />
      </aside>
    </>
  );
}
