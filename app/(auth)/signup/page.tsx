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

import { AUTH_LINK } from "../auth-link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your shop · Repairs helper",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; email?: string }> ;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { google, email } = await searchParams;

  return (
    <>
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Create your shop
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Free to start. It sets up your shop and makes you the owner; you can add your team after.
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

      <SignupForm email={email?.slice(0, 254)} />

      {/* Consent where the account (and its personal data) is created. */}
      <p className="mt-4 text-center text-[14px] leading-relaxed text-muted-foreground">
        By creating a shop you agree to the{" "}
        <Link href="/terms" className={AUTH_LINK}>
          Terms
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className={AUTH_LINK}>
          Privacy policy
        </Link>
        .
      </p>

      <p className="mt-2 border-t border-border pt-4 text-center text-[15px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className={AUTH_LINK}>
          Sign in
        </Link>
      </p>
    </>
  );
}
