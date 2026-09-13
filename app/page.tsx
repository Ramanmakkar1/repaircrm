import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { DeepDives } from "@/components/landing/deep-dives";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/nav";
import { Pricing } from "@/components/landing/pricing";
import { Showcase } from "@/components/landing/showcase";

const TITLE = "RepairPilot — repair shop software";
const DESCRIPTION =
  "Tickets, estimates and invoices, a point-of-sale counter with inventory, a customer portal and follow-ups — one system for phone, computer, console, mail-in and on-site repair shops. Free while in early access.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "RepairPilot",
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
 * Signed-in staff never see marketing — they land on the dashboard, which is
 * what "/" did before this page existed. Everyone else gets the landing page.
 * Reading the session cookie makes this route dynamic, which is what we want:
 * the copyright year and the redirect decision are both evaluated per request.
 */
export default async function RootPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    /*
     * `rf-landing` re-declares the light tokens for this subtree — the landing
     * page is light-only by design (see the block at the end of globals.css).
     */
    <div className="rf-landing flex min-h-screen flex-col">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <Features />
        <DeepDives />
        <Showcase />
        <Pricing />
        <Faq />
      </main>
      <LandingFooter />
    </div>
  );
}
