import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import "@/components/landing/site.css";
import { PublicSite } from "@/components/public/public-site";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Report a bug or request a feature · Repairs helper", robots: { index: false, follow: true } };
export default async function FeedbackPage() {
  const session = await getSession();
  const returnHref = session ? "/counter?tab=counter" : "/";
  // Signed in, the way out is back to the shop, not "Start free".
  const back = session ? (
    <Link href={returnHref} className="inline-flex min-h-12 items-center gap-2 rounded-full px-2 text-sm font-semibold text-(--site-accent-ink)">
      <ArrowLeft size={16} aria-hidden="true" />
      Back to your shop
    </Link>
  ) : undefined;
  return (
    <PublicSite actions={back}>
      {/* `.site` carries the feedback form's styles (components/landing/site.css). */}
      <div className="site site-feedback">
        <div className="site-container site-feedback-layout">
          <div className="site-feedback-intro">
            <h1>Help us improve<br /> Repairs helper.</h1>
            <p>Found a bug? Missing a feature? Tell us what would make your working day easier.</p>
            <p>For a repair update, please contact your repair shop or <Link href="/portal">check your repair in the customer portal</Link>.</p>
          </div>
          <FeedbackForm returnHref={returnHref} />
        </div>
      </div>
    </PublicSite>
  );
}
