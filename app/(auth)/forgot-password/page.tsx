import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSession } from "@/lib/auth";

import { Button } from "@/components/ui/button";

import { AUTH_LINK } from "../auth-link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset your password · Repairs helper",
};

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <>
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Reset your password
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Enter the email you sign in with and we&apos;ll send you a link.
        </p>
      </div>

      <ForgotForm />
      <Button asChild size="lg" variant="outline" className="mt-3 h-12 min-h-12 w-full text-[15px]">
        <Link href="/email-code?purpose=reset">Use a 6-digit email code instead</Link>
      </Button>

      <p className="mt-4 text-center text-[15px] text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className={AUTH_LINK}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
