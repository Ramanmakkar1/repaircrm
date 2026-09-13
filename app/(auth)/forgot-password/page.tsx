import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSession } from "@/lib/auth";

import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset your password · RepairPilot",
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

      <p className="mt-7 text-center text-[14.5px] text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
