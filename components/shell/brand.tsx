import Link from "next/link";
import { Wrench } from "lucide-react";

export function Brand() {
  return (
    <Link
      href="/dashboard"
      /* px-3 so the mark's left edge lines up with the nav row icons below */
      className="flex items-center gap-3 rounded-md px-3 py-1.5 transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-xs">
        <Wrench className="size-[18px]" strokeWidth={2.5} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-bold tracking-tight text-foreground">
          RepairFlow
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          Repair shop
        </span>
      </span>
    </Link>
  );
}
