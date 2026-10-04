import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { RepairPilotWordmark } from "@/components/brand/repairpilot";
import { BrandMark } from "@/components/landing/brand";
import { manrope } from "@/components/landing/fonts";
import "@/components/landing/site.css";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Report a bug or request a feature | RepairsHelper", robots: { index: false, follow: true } };
export default async function FeedbackPage() {
  const session = await getSession();
  const returnHref = session ? "/counter?tab=counter" : "/";
  return (
    <div className={`${manrope.className} ${manrope.variable} site site-feedback min-h-screen`}>
      <header className="site-feedback-header site-container">
        <Link href={returnHref} className="site-footer-logo"><BrandMark className="size-10" priority /><RepairPilotWordmark className="text-xl" /></Link>
        <Link href={returnHref} className="site-feedback-back"><ArrowLeft size={16} aria-hidden="true" />{session ? "Back to your shop" : "Back to home"}</Link>
      </header>
      <main className="site-container site-feedback-layout">
        <div className="site-feedback-intro">
          <h1>Help us improve<br />RepairsHelper.</h1>
          <p>Found a bug? Missing a feature? Tell us what would make your working day easier.</p>
          <p>For a repair update, please contact your repair shop or <Link href="/portal">check your repair in the customer portal</Link>.</p>
        </div>
        <FeedbackForm returnHref={returnHref} />
      </main>
    </div>
  );
}
