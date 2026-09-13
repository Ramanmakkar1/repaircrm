import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { RepairPilotMark, RepairPilotWordmark } from "@/components/brand/repairpilot";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label="RepairPilot — go to the dashboard"
      /* px-3 so the mark's left edge lines up with the nav row icons below */
      className={cn(
        "flex items-center rounded-md transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        compact ? "justify-center p-1" : "gap-3 px-3 py-1.5",
      )}
    >
      <RepairPilotMark className="size-9" />
      {compact ? null : (
        <span className="flex flex-col leading-tight">
          <RepairPilotWordmark className="text-[15px] text-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Repair shop
          </span>
        </span>
      )}
    </Link>
  );
}
