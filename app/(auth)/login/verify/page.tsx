import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSession } from "@/lib/auth";
import { readPending2fa } from "@/lib/pending-2fa";

import { VerifyForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Two-step verification · RepairFlow",
};

/**
 * Step two of signing in. Reaching this page without the pending cookie means
 * the password step was skipped or has timed out, so it bounces to /login.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const pending = await readPending2fa();
  if (!pending) redirect("/login");

  const { next } = await searchParams;
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <>
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Enter your code
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Open your authenticator app and type the 6-digit code for RepairFlow.
        </p>
      </div>

      <VerifyForm next={target} />

      <p className="mt-7 text-center text-[14.5px] text-muted-foreground">
        Lost your phone? Type one of your recovery codes instead, or{" "}
        <Link
          href="/login"
          className="font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          start over
        </Link>
        .
      </p>
    </>
  );
}
