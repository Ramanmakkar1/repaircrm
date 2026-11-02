import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GUIDES } from "@/components/marketing/content/guides";
import { Band, ClosingCta, PageHero, Related } from "@/components/marketing/parts";
import { COMPARE_LINK, PRICING_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { formatLongDate } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Repair Shop Guides: Intake, Pricing, Warranty and More | Repairs helper",
  description:
    "Practical guides for phone, computer and electronics repair shops: intake checklists, pricing repairs, warranty policies, unclaimed devices and choosing software.",
  path: "/guides",
});

const TRAIL = [{ name: "Guides", path: "/guides" }];

export default function GuidesIndexPage() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbSchema(TRAIL)} />
      <PageHero
        trail={TRAIL}
        eyebrow="Guides"
        title="Guides for running a repair shop"
        lede={
          <p>
            Straight answers to the questions that come up at a repair counter: what to record at check-in, how
            to price a repair, what a warranty should cover and what to do when nobody comes back for a device.
          </p>
        }
      />

      <Band id="guides" tone="tray" title="All guides">
        <ul className="grid gap-4 md:grid-cols-2">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={`/guides/${guide.slug}`}
                className="group flex h-full flex-col rounded-2xl bg-white p-6 transition-shadow hover:shadow-md"
              >
                <h3 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight text-neutral-900">
                  {guide.name}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">{guide.summary}</p>
                <p className="mt-3 text-[13px] text-neutral-600">
                  Updated <time dateTime={guide.updated}>{formatLongDate(guide.updated)}</time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Related
        links={[
          { href: "/features", title: "All features", body: "Every part of the app, with what each one needs before you rely on it." },
          PRICING_LINK,
          COMPARE_LINK,
        ]}
      />
      <ClosingCta
        title="Put it into practice"
        body="Repairs helper turns these routines into screens: check-in, estimates, warranty tracking and pickup. Free during early access."
      />
    </MarketingShell>
  );
}
