import Link from "next/link";
import type { ReactNode } from "react";
import { RepairPilotMark, RepairPilotWordmark } from "@/components/brand/repairpilot";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-7 flex items-center justify-center gap-3 text-foreground"
        >
          <RepairPilotMark className="size-12" />
          <RepairPilotWordmark className="text-2xl" />
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-7 shadow-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
