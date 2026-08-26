import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-slate-900"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            RF
          </span>
          <span className="text-lg font-semibold tracking-tight">
            RepairFlow
          </span>
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
