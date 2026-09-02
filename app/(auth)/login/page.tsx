import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSession } from "@/lib/auth";
import { googleConfigured } from "@/lib/google/config";
import { googleNotice, offersSignup } from "@/lib/google/messages";
import {
  AuthDivider,
  GoogleButton,
  GoogleNoticeBanner,
} from "@/components/auth/google-button";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · RepairFlow",
};

/**
 * Why the browser was sent back here, in the operator's words. Set by
 * /session-expired when a session stops being valid mid-visit.
 */
const NOTICES: Record<string, string> = {
  "password-changed":
    "Your password was changed on another device. Please sign in again.",
  inactive: "That account is no longer active. Ask the shop owner to re-enable it.",
  "signed-out": "You've been signed out. Please sign in again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string; google?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { next, notice, google } = await searchParams;
  const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const noticeText = notice ? NOTICES[notice] : undefined;
  const googleOn = googleConfigured();

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

      {noticeText ? (
        <p className="mb-5 rounded-md border border-border-strong bg-surface-hover px-4 py-3 text-[14.5px] font-medium text-foreground">
          {noticeText}
        </p>
      ) : null}

      {/* Whatever the last Google round trip ended as, in one sentence. */}
      <GoogleNoticeBanner notice={googleNotice(google)}>
        {offersSignup(google) ? (
          <>
            {" "}
            <Link
              href="/signup"
              className="font-semibold underline underline-offset-4"
            >
              Create a shop
            </Link>
            .
          </>
        ) : null}
      </GoogleNoticeBanner>

      {/* Absent entirely when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are
          unset — a button that can only fail is worse than no button. */}
      {googleOn ? (
        <>
          <GoogleButton intent="signin" next={redirectTo} />
          <AuthDivider />
        </>
      ) : null}

      <LoginForm redirectTo={redirectTo} />

      <p className="mt-6 text-center text-[14.5px]">
        <Link
          href="/forgot-password"
          className="font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Forgot password?
        </Link>
      </p>

      <p className="mt-4 text-center text-[14.5px] text-muted-foreground">
        New here?{" "}
        <Link
          href="/signup"
          className="font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Create a shop
        </Link>
      </p>

      {/*
        This page is for staff, but it is also where a customer hunting for
        their repair ends up — /portal already points people the other way, and
        without the return leg they have nowhere to go but the back button.
      */}
      <p className="mt-6 border-t border-border pt-5 text-center text-[13.5px] text-muted-foreground">
        Had a device repaired?{" "}
        <Link
          href="/portal"
          className="font-semibold text-foreground underline underline-offset-4 hover:text-accent"
        >
          Check your repair here
        </Link>
      </p>
    </>
  );
}
