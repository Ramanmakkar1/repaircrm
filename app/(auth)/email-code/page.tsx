import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homePath } from "@/lib/prefs";
import { EmailCodeForm } from "./code-form";
export const metadata = { title: "Email code · Repairs helper" };
export default async function EmailCodePage({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  if (await getSession()) redirect(await homePath());
  const purpose = (await searchParams).purpose === "reset" ? "reset" : "login";
  return <>
    <h1 className="text-2xl font-semibold tracking-tight">{purpose === "reset" ? "Reset with an email code" : "Sign in with an email code"}</h1>
    <p className="mt-2 mb-7 text-sm leading-relaxed text-muted-foreground">Use the email address on your account. Any email provider works — no Google account needed.</p>
    <EmailCodeForm purpose={purpose} />
    <p className="mt-7 text-center text-sm"><Link href="/login" className="font-medium underline underline-offset-4">Back to sign in</Link></p>
  </>;
}
