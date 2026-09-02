import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { resolveResetToken } from "@/lib/password-reset";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Choose a new password · RepairFlow",
};

/**
 * The page behind a reset or invite link.
 *
 * The token is checked here as well as in the action, so a stale link says so
 * immediately instead of after someone has typed a password twice.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { token } = await params;
  const resolved = await resolveResetToken(token);

  if (!resolved) {
    return (
      <>
        <div className="mb-6 space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            This link has expired
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Reset links work once, and only for a short time. Request a fresh
            one and it will arrive in a moment.
          </p>
        </div>

        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Send me a new link</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Choose a new password
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Signing in as {resolved.email}. You&apos;ll be taken straight to your
          dashboard.
        </p>
      </div>

      <ResetForm token={token} />
    </>
  );
}
