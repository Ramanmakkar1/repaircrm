import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SHOTS } from "@/components/landing/media";
import { FEATURE_PAGES } from "@/components/marketing/content/features";
import { SOFTWARE_PAGES } from "@/components/marketing/content/software";
import {
  Band,
  ClosingCta,
  HeroActions,
  PageHero,
  PointGrid,
  Related,
  Shot,
} from "@/components/marketing/parts";
import { COMPARE_LINK, CONTACT_LINK, PRICING_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema } from "@/lib/seo/schema";

export const metadata = pageMetadata({
  title: "Repair Shop Management Software Features | Repairs helper",
  description:
    "Repair tickets, estimates and invoices, POS, inventory, a customer portal, an AI assistant and integrations: every Repairs helper feature, explained.",
  path: "/features",
});

const TRAIL = [{ name: "Features", path: "/features" }];

/** Smaller tools that do not need a page of their own. */
const MORE = [
  {
    title: "Appointments",
    body: "Book visits with a customer, a staff member and a location. Reminders go out in the 24 hours before when a sender is set up.",
  },
  {
    title: "Leads",
    body: "Website enquiries and the Book a visit and Get a price requests from your shop page arrive as leads with the device, the problem and contact details, ready to turn into a repair.",
  },
  {
    title: "Time clock",
    body: "Staff clock in and out, and owners can correct entries and export the hours for payroll.",
  },
  {
    title: "Reports",
    body: "Money in after refunds, how people paid, invoices written and paid, repairs in and out, time to fix, best-selling products and refunds, with CSV export.",
  },
  {
    title: "Roles and staff PINs",
    body: "Owner, technician and front-desk roles. Front desk handles intake, customers and billing without settings access. Six-digit PINs switch staff on a shared device.",
  },
  {
    title: "More than one location",
    body: "Open a second store and switch between locations, or view all of them together. Single-location shops never see the switcher.",
  },
  {
    title: "Easy mode and Full view",
    body: "Easy mode gives the counter big picture buttons. Full view adds dense tables for the back office. Both use the same records.",
  },
  {
    title: "Security",
    body: "Two-step sign-in with an authenticator app, recovery codes, and an audit log of sensitive changes.",
  },
];

export default function FeaturesIndexPage() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbSchema(TRAIL)} />
      <PageHero
        trail={TRAIL}
        eyebrow="Features"
        title="Repair shop management software, feature by feature"
        lede={
          <p>
            Repairs helper covers the work of an independent repair shop: checking devices in, fixing them,
            quoting, billing, selling over the counter, keeping stock and keeping customers informed. Each
            page below explains how a feature works and what it needs before you rely on it.
          </p>
        }
      >
        <HeroActions secondary={{ href: "/pricing", label: "See pricing" }} />
      </PageHero>

      <div className="mx-auto w-full max-w-[1184px] px-5 pb-16 sm:px-8">
        <Shot
          shot={SHOTS.home}
          caption="The Home screen on a counter tablet, captured from the app with demo data: New repair and New sale, the Needs attention list and the main tools."
          priority
        />
      </div>

      <Band id="main-features" tone="tray" title="The main parts of the app">
        <ul className="grid gap-4 md:grid-cols-2">
          {FEATURE_PAGES.map((page) => (
            <li key={page.slug}>
              <Link
                href={`/features/${page.slug}`}
                className="group flex h-full flex-col rounded-2xl bg-white p-6 transition-shadow hover:shadow-md"
              >
                <h3 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight text-neutral-900">
                  {page.name}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">{page.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Band id="more" title="Also included">
        <PointGrid points={MORE} />
      </Band>

      <Band id="by-shop" tone="tray" title="By type of shop">
        <ul className="grid gap-4 md:grid-cols-2">
          {SOFTWARE_PAGES.map((page) => (
            <li key={page.slug}>
              <Link
                href={`/software/${page.slug}`}
                className="group flex h-full flex-col rounded-2xl bg-white p-6 transition-shadow hover:shadow-md"
              >
                <h3 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight text-neutral-900">
                  {page.name}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">{page.metaDescription}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Related links={[PRICING_LINK, COMPARE_LINK, CONTACT_LINK]} title="Before you sign up" />
      <ClosingCta
        title="See it with your own repairs"
        body="Create your shop, check in a test device and run it through to pickup. It is free during early access."
      />
    </MarketingShell>
  );
}
