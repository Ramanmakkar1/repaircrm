import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { homePath } from "@/lib/prefs";
import { RepairsHome } from "@/components/landing/repairs-home";

const TITLE = "Repairs helper — repair shop software";
const DESCRIPTION =
  "Repair shop CRM for phone, computer and console teams. Track repairs, parts, estimates, invoices and customer updates in one workspace. Free during early access.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Repairs helper",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: { canonical: "/" },
};

/**
 * "/" is two pages in one.
 *
 * Signed-in staff land on Counter in either view.
 * Signed-out visitors get the public product page.
 * Reading the session cookie makes this route dynamic, which is what we want:
 * the copyright year and the redirect decision are both evaluated per request.
 */
export default async function RootPage() {
  const session = await getSession();
  if (session) redirect(await homePath());

  return <RepairsHome />;
}
