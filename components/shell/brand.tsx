import Link from "next/link";
import { Wrench } from "lucide-react";
import { cn } from "@/components/ui/cn";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label="RepairFlow — go to the dashboard"
      /* px-3 so the mark's left edge lines up with the nav row icons below */
      className={cn(
        "flex items-center rounded-md transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        compact ? "justify-center p-1" : "gap-3 px-3 py-1.5",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-xs">
        <Wrench className="size-[18px]" strokeWidth={2.5} />
      </span>
      {/* The mark alone in the collapsed rail. The wordmark is the thing that
          needs the 240px; the wrench identifies the app perfectly well without
          it, and it is still the link home. */}
      {compact ? null : (
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            RepairFlow
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Repair shop
          </span>
        </span>
      )}
    </Link>
  );
}
