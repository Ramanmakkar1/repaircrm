import Link from "next/link";
import { Users, UserX } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { initialsOf } from "./calendar-meta";

export type StaffChip = {
  /** "all", "unassigned" or a user id. */
  key: string;
  label: string;
  href: string;
  active: boolean;
};

/**
 * "Whose visits": Everyone, Not assigned, then each person as their initials
 * and name. One scrolling row (it never takes a second line on a phone), every
 * chip 48px tall, the chosen one filled and marked `aria-current`.
 */
export function StaffChips({ chips, className }: { chips: StaffChip[]; className?: string }) {
  if (chips.length <= 2) return null;
  return (
    <div
      role="navigation"
      aria-label="Whose visits"
      className={cn("flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      <span className="shrink-0 text-[15px] font-medium text-muted-foreground">Staff</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          scroll={false}
          data-touch-control
          aria-current={chip.active ? "true" : undefined}
          className={cn(
            "inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border pl-1.5 pr-3.5 text-[15px] font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            chip.active
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-surface text-foreground hover:border-ring",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-[13px] font-semibold",
              chip.active ? "bg-accent-foreground/15 text-accent-foreground" : "bg-accent-soft text-accent-soft-foreground",
            )}
          >
            {chip.key === "all" ? (
              <Users className="size-4" />
            ) : chip.key === "unassigned" ? (
              <UserX className="size-4" />
            ) : (
              initialsOf(chip.label)
            )}
          </span>
          {chip.label}
        </Link>
      ))}
    </div>
  );
}
