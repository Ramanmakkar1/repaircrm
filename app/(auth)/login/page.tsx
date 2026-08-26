import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSession } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · RepairFlow",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { next } = await searchParams;
  const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <>
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Sign in
        </h1>
        <p className="text-sm text-slate-500">
          Welcome back. Enter your details to continue.
        </p>
      </div>

      <LoginForm redirectTo={redirectTo} />

      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{" "}
        <Link
          href="/signup"
          className="font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700"
        >
          Create a shop
        </Link>
      </p>
    </>
  );
}
