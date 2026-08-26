import Link from "next/link";
import { Wrench } from "lucide-react";

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Wrench className="size-3.5" strokeWidth={2.5} />
      </span>
      <span className="text-[13px] font-semibold tracking-tight text-foreground">
        RepairFlow
      </span>
    </Link>
  );
}
