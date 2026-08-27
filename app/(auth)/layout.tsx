import Link from "next/link";
import type { ReactNode } from "react";
import { Wrench } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-7 flex items-center justify-center gap-3 text-foreground"
        >
          <span className="flex size-12 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-sm">
            <Wrench className="size-6" strokeWidth={2.5} />
          </span>
          <span className="text-2xl font-bold tracking-tight">RepairFlow</span>
        </Link>

        <div className="rounded-xl border border-border bg-surface p-7 shadow-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
