import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { homePath } from "@/lib/prefs";
import { AUTH_LINK } from "../auth-link";
import { EmailCodeForm } from "./code-form";

export const metadata = { title: "Sign in with an email code · Repairs helper" };

/** Sign in, or reset a password, with a 6-digit code sent to the account's email. */
export default async function EmailCodePage({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  if (await getSession()) redirect(await homePath());
  const purpose = (await searchParams).purpose === "reset" ? "reset" : "login";
  return (
    <>
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {purpose === "reset" ? "Reset with an email code" : "Sign in with an email code"}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          We email a 6-digit code to the address on your account. No password needed.
        </p>
      </div>
      <EmailCodeForm purpose={purpose} />
      <p className="mt-4 text-center text-[15px]">
        <Link href="/login" className={AUTH_LINK}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
