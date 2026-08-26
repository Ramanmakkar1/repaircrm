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
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Create your shop
        </h1>
        <p className="text-sm text-slate-500">
          Sets up your workspace and makes you the owner.
        </p>
      </div>

      <SignupForm />

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
