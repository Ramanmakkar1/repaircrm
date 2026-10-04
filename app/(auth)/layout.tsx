import Link from "next/link";
import type { ReactNode } from "react";

import { RepairPilotMark, RepairPilotWordmark } from "@/components/brand/repairpilot";
import { LegalLinks } from "@/components/public/shell";

/**
 * The sign-in family (sign in, create a shop, email code, forgot / reset /
 * change password, two-step code): one calm card under the Repairs helper
 * mark, with Privacy and Terms under it on every one of them, because every
 * one of them takes personal details.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full flex-1 flex-col items-center bg-background px-4 py-8 text-foreground sm:justify-center sm:py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mx-auto mb-6 flex min-h-12 w-fit items-center justify-center gap-3 rounded-xl px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RepairPilotMark className="size-12" />
          <RepairPilotWordmark className="text-2xl" />
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-7">{children}</div>

        <LegalLinks className="mt-4 justify-center" />
      </div>
    </div>
  );
}
