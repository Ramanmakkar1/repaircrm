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
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Welcome back. Enter your details to continue.
        </p>
      </div>

      <LoginForm redirectTo={redirectTo} />

      <p className="mt-7 text-center text-[14.5px] text-muted-foreground">
        New here?{" "}
        <Link
          href="/signup"
          className="font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Create a shop
        </Link>
      </p>
    </>
  );
}
