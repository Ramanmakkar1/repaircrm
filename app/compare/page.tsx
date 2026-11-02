import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { COMPARE_PAGES } from "@/components/marketing/content/compare";
import { Band, ClosingCta, FaqSection, HeroActions, Note, PageHero, PointGrid, Related } from "@/components/marketing/parts";
import { CONTACT_LINK, PRICING_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { formatLongDate } from "@/lib/seo/site";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";

export const metadata = pageMetadata({
  title: "Repair Shop Software Compared: Alternatives Side by Side | Repairs helper",
  description:
    "Repairs helper compared with other repair shop software, using each company's own published pricing and features, with sources and the date checked.",
  path: "/compare",
});

const TRAIL = [{ name: "Compare", path: "/compare" }];

/** Questions worth answering before any switch, whichever software you pick. */
const CHECKS = [
  {
    title: "Count seats and locations",
    body: "Many repair shop tools price by user or by store. Write down how many people log in and how many locations you run, then price each plan for that.",
  },
  {
    title: "Add up message and card fees",
    body: "Text messages and card processing are often billed separately, by the software or by a provider such as Twilio, Stripe or Square. Include them in the monthly cost.",
  },
  {
    title: "Check your card machine",
    body: "Find out whether the POS can send amounts to the card reader you already own, or whether you will key amounts in by hand.",
  },
  {
    title: "Plan the move",
    body: "Ask what can be imported (customers, products, open repairs, history) and what stays behind. Run a few real repairs in a trial before you switch the counter over.",
  },
];

const FAQS = [
  {
    q: "How are these comparisons put together?",
    a: "Each competitor column paraphrases only what that company publishes on its own website, with a link to the page and the date it was read. Anything we could not confirm is left out rather than guessed.",
  },
  {
    q: "What is the cheapest repair shop software?",
    a: "Repairs helper is free during early access, with every staff account included and no credit card. Other tools publish monthly plans priced by users or locations; each comparison lists the prices from the company's own pricing page.",
  },
  {
    q: "Can I move my data from another repair system?",
    a: "Customers and products can be imported into Repairs helper from a spreadsheet or CSV export. Repair history cannot be migrated in one step yet.",
  },
];

export default function CompareIndexPage() {
  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(TRAIL), faqSchema(FAQS)]} />
      <PageHero
        trail={TRAIL}
        eyebrow="Compare"
        title="Repair shop software, compared side by side"
        lede={
          <p>
            Looking for an alternative to the repair software you use now, or choosing your first one? Each page
            below puts Repairs helper next to another product, using that company&apos;s own published pricing and
            features, with sources and the date we checked.
          </p>
        }
      >
        <HeroActions secondary={{ href: "/pricing", label: "Repairs helper pricing" }} />
      </PageHero>

      <Band id="comparisons" tone="tray" title="Comparisons">
        <ul className="grid gap-4 md:grid-cols-2">
          {COMPARE_PAGES.map((page) => (
            <li key={page.slug}>
              <Link
                href={`/compare/${page.slug}`}
                className="group flex h-full flex-col rounded-2xl bg-white p-6 transition-shadow hover:shadow-md"
              >
                <h3 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight text-neutral-900">
                  {page.competitor} alternative
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">{page.summary}</p>
                <p className="mt-3 text-[13px] text-neutral-600">Checked {formatLongDate(page.checked)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Band id="checks" title="What to check before you switch">
        <PointGrid points={CHECKS} />
        <div className="mt-12 max-w-3xl">
          <Note title="Trademarks">
            Product names on these pages are trademarks of their owners. Repairs helper is an independent product
            operated by Town Media Labs in Edmonton, Canada, and is not affiliated with the companies compared.
          </Note>
        </div>
      </Band>

      <FaqSection faqs={FAQS} title="Comparison questions" />
      <Related
        links={[
          PRICING_LINK,
          { href: "/features", title: "All features", body: "Every part of the app, with what each one needs before you rely on it." },
          CONTACT_LINK,
        ]}
      />
      <ClosingCta
        title="Try Repairs helper next to what you use now"
        body="Create a shop, import a few customers and products from a CSV, and run a test repair through to pickup."
      />
    </MarketingShell>
  );
}
