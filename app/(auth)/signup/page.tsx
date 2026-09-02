import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSession } from "@/lib/auth";
import { googleConfigured } from "@/lib/google/config";
import { googleNotice } from "@/lib/google/messages";
import {
  AuthDivider,
  GoogleButton,
  GoogleNoticeBanner,
} from "@/components/auth/google-button";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your shop · RepairFlow",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { google } = await searchParams;

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

      <GoogleNoticeBanner notice={googleNotice(google)} />

      {googleConfigured() ? (
        <>
          {/* Creates the same Shop + Main location + OWNER a password signup
              does, then lands on the same /setup wizard. */}
          <GoogleButton intent="signup" label="Sign up with Google" />
          <AuthDivider />
        </>
      ) : null}

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
