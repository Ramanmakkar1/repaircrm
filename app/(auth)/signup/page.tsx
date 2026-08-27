import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSession } from "@/lib/auth";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your shop · RepairFlow",
};

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <>
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Create your shop
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Sets up your workspace and makes you the owner.
        </p>
      </div>

      <SignupForm />

      <p className="mt-7 text-center text-[14.5px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
