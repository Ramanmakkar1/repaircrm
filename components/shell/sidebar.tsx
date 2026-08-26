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
      {/* desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar-bg md:flex">
        <div className="flex h-12 items-center border-b border-border px-2">
          <Brand />
        </div>
        <NavLinks />
      </aside>

      {/* mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-overlay transition-opacity md:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!mobileOpen}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar-bg transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-12 items-center justify-between border-b border-border px-2">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>
        <NavLinks onNavigate={onClose} />
      </aside>
    </>
  );
}
