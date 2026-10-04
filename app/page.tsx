import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { homePath } from "@/lib/prefs";
import { RepairsHome } from "@/components/landing/repairs-home";
import { WEBSITE_SCHEMA, SOFTWARE_SCHEMA } from "@/lib/public-site";

const TITLE =
  "Repair Shop Software & AI Helper | RepairsHelper";
const DESCRIPTION =
  "Manage repairs, sales, inventory and customer updates with RepairsHelper and its AI helper. Works on mobile, tablet and desktop. Free during early access.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "RepairsHelper",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [
      {
        url: "/marketing/repair-shop-software-husky-og.png",
        width: 1200,
        height: 630,
        alt: "Repairs helper — repair shop software built for your counter",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/marketing/repair-shop-software-husky-og.png"],
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(WEBSITE_SCHEMA).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(SOFTWARE_SCHEMA).replace(/</g, "\\u003c"),
        }}
      />
      <RepairsHome />
    </>
  );
}
