import Link from "next/link";
import { Wrench } from "lucide-react";

export function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-sm">
        <Wrench className="size-5" strokeWidth={2.5} />
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
