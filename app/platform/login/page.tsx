import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { assertPlatformHost } from "@/lib/platform-admin";
import { readPlatformCookie } from "@/lib/platform-session";
import { PlatformLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Operator sign-in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The operator door. Not linked from anywhere in the shop app, not the shop
 * login, and no "create account" — operators are added from the command line.
 */
export default async function PlatformLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  await assertPlatformHost();
  if (await readPlatformCookie()) {
    const { reason } = await searchParams;
    // An expired or revoked session still has a cookie; only a live one skips the form.
    if (reason !== "expired") redirect("/platform");
  }
  const { reason } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0f1115] px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#171a21] p-6 text-white shadow-2xl sm:p-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">RepairPilot</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight">Operator sign-in</h1>
        <p className="mt-1.5 text-[14px] text-white/60">
          Platform administration. Shop accounts can&rsquo;t sign in here.
        </p>
        {reason === "expired" ? (
          <p className="mt-4 rounded-md bg-amber-500/15 px-3 py-2 text-[13.5px] text-amber-200">
            Your session ended. Sign in again.
          </p>
        ) : null}
        <PlatformLoginForm />
      </div>
    </main>
  );
}
