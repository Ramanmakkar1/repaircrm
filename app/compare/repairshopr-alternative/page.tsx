import Link from "next/link";

import {
  Band,
  ClosingCta,
  FaqSection,
  HeroActions,
  Note,
  PageHero,
  PointGrid,
  Related,
} from "@/components/marketing/parts";
import { CONTACT_LINK, PRICING_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";

export const metadata = pageMetadata({
  title: "RepairShopr Alternative: Repairs helper Compared | Repairs helper",
  description:
    "Repairs helper and RepairShopr side by side: published pricing, users, locations, portal, POS, inventory and integrations. Checked October 2026, with sources.",
  path: "/compare/repairshopr-alternative",
});

// There is no /compare index yet, so the trail is Home > this page.
const TRAIL = [{ name: "RepairShopr alternative", path: "/compare/repairshopr-alternative" }];

const CHECKED = "checked October 28, 2026";

const SOURCES = {
  pricing: { href: "https://www.repairshopr.com/pricing", label: "RepairShopr pricing page" },
  features: { href: "https://www.repairshopr.com/features", label: "RepairShopr features page" },
  home: { href: "https://www.repairshopr.com/", label: "RepairShopr home page" },
} as const;

type SourceKey = keyof typeof SOURCES;

/** Each RepairShopr cell is a paraphrase of its own public page, cited by key. */
const ROWS: { topic: string; ours: string; theirs: string; source: SourceKey[] }[] = [
  {
    topic: "Published price",
    ours: "$0 per shop during early access. No credit card asked for.",
    theirs:
      "Three plans: Starter $69.99 USD, Repair Shop $139.99 USD and Big Chain $149.99 USD on the monthly option; $59.99, $129.99 and $139.99 USD on the annual “Buy & Save” option.",
    source: ["pricing"],
  },
  {
    topic: "Staff accounts",
    ours: "Every staff account included during early access, with owner, technician and front-desk roles.",
    theirs: "Starter lists 1 user account; Repair Shop and Big Chain list 10 user accounts.",
    source: ["pricing"],
  },
  {
    topic: "Tickets and invoices",
    ours: "No plan tiers during early access.",
    theirs: "Starter lists 75 tickets and invoices per month; the other plans list unlimited.",
    source: ["pricing"],
  },
  {
    topic: "Locations",
    ours: "Multiple locations with a location switcher and an all-locations view.",
    theirs: "Starter and Repair Shop list one location; Big Chain lists 2+ locations.",
    source: ["pricing"],
  },
  {
    topic: "Trying it",
    ours: "Free to use during early access.",
    theirs: "Offers a free trial.",
    source: ["home"],
  },
  {
    topic: "Customer portal",
    ours: "Repair status, estimate approval with optional signature, online payment, new repair requests. Sign-in by link, no password.",
    theirs: "Customers can check status, see invoice history and approve or decline estimates; access by login or email link.",
    source: ["features"],
  },
  {
    topic: "Point of sale",
    ours: "Sell screen with barcode scanning, Stripe Terminal and Square Terminal, manual mode for other card machines, cash drawer sessions.",
    theirs: "POS linked to inventory; Cash Registers listed on all plans.",
    source: ["features", "pricing"],
  },
  {
    topic: "Inventory",
    ours: "Low-stock levels, serial numbers, vendors, purchase orders, barcode labels, CSV import.",
    theirs: "Stock levels with reorder reminders, barcode labels, CSV import and export, purchase order history.",
    source: ["features"],
  },
  {
    topic: "Online payments",
    ours: "Stripe and Square, connected with your own account.",
    theirs: "Stripe, PayPal and Authorize.net listed as online payment integrations.",
    source: ["features"],
  },
  {
    topic: "Accounting",
    ours: "QuickBooks Online and Xero.",
    theirs: "QuickBooks integration listed on all plans; Xero named among integrations on the home page.",
    source: ["pricing", "home"],
  },
  {
    topic: "Text messages",
    ours: "Through your own Twilio account; Twilio bills you directly.",
    theirs: "An SMS allowance per month that varies by plan.",
    source: ["pricing"],
  },
  {
    topic: "Marketing",
    ours: "Follow-up campaigns triggered by resolved repairs, paid invoices or new customers, plus post-pickup review requests.",
    theirs: "Marketr automated marketing listed on all plans.",
    source: ["pricing"],
  },
  {
    topic: "Field jobs and mail",
    ours: "Not available. Appointments are for visits to your shop.",
    theirs: "Field Jobs listed on all plans; Snail Mail in the U.S. with stamp credits bought separately.",
    source: ["pricing"],
  },
  {
    topic: "API",
    ours: "REST API (v1) with per-shop keys, plus signed webhooks for 12 events.",
    theirs: "Mentions an app center of integrations and an API.",
    source: ["home"],
  },
];

const DIFFERENT = [
  {
    title: "Built for a tablet on the counter",
    body: "Easy mode puts New repair and New sale on two big buttons, with picture boxes for devices and problems. Full view adds tables for the back office.",
  },
  {
    title: "An AI assistant in the app",
    body: "Ask about repairs, stock and sales, summarise ticket notes and draft customer replies, by typing or by voice. It asks before changing anything.",
  },
  {
    title: "Walk-in check-in and a shop page",
    body: "A public check-in form with a QR code or kiosk mode, and one shop link for status, booking, quotes and payment.",
  },
  {
    title: "Card machines either way",
    body: "Send the amount to a Stripe Terminal or Square Terminal reader, or keep your bank's machine and record the payment with one tap.",
  },
];

const FAQS = [
  {
    q: "Is Repairs helper a good RepairShopr alternative for a small shop?",
    a: "It can be if you run an in-shop repair counter and want tickets, POS, inventory and a customer portal without per-user pricing during early access. If you rely on field jobs, mailed letters or a specific RepairShopr integration, check that first: those are not in Repairs helper.",
  },
  {
    q: "Can I import my data from RepairShopr?",
    a: "Customers and products can be imported from a spreadsheet or CSV export. Repair history cannot be migrated in one step yet.",
  },
  {
    q: "Where did the RepairShopr details come from?",
    a: "From RepairShopr's own public pricing, features and home pages, checked on October 28, 2026. Plans and prices change, so confirm on their site before deciding.",
  },
  {
    q: "Is Repairs helper affiliated with RepairShopr?",
    a: "No. Repairs helper is an independent product operated by Town Media Labs in Edmonton, Canada. RepairShopr is a trademark of its owner.",
  },
];

function Source({ ids }: { ids: SourceKey[] }) {
  return (
    <>
      {ids.map((id) => (
        <a
          key={id}
          href={SOURCES[id].href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-[12px] text-neutral-600 underline underline-offset-2"
        >
          Source: {SOURCES[id].label}
        </a>
      ))}
    </>
  );
}

export default function RepairShoprAlternativePage() {
  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(TRAIL), faqSchema(FAQS)]} />
      <PageHero
        trail={TRAIL}
        eyebrow="Compare"
        title="Repairs helper as a RepairShopr alternative"
        lede={
          <>
            <p>
              RepairShopr is a long-established repair shop platform. Repairs helper is a newer one in early
              access. This page puts the two side by side using only what RepairShopr publishes on its own
              website ({CHECKED}), so you can see where each fits.
            </p>
          </>
        }
      >
        <HeroActions secondary={{ href: "/pricing", label: "Repairs helper pricing" }} />
      </PageHero>

      <Band
        id="table"
        tone="tray"
        title="Side by side"
        intro={
          <p>
            RepairShopr details are paraphrased from the linked pages, {CHECKED}. Prices are as listed there in
            USD. Where we could not confirm a RepairShopr detail, it is left out rather than guessed.
          </p>
        }
      >
        <div className="rounded-2xl bg-white md:overflow-x-auto">
          {/* Below md each row stacks into a card with its own labels; the header row is visually hidden. */}
          <table className="w-full border-collapse text-left text-[14px] leading-relaxed max-md:block md:min-w-[640px]">
            <caption className="sr-only">Repairs helper and RepairShopr compared, {CHECKED}</caption>
            <thead className="max-md:sr-only">
              <tr className="border-b border-neutral-200">
                <th scope="col" className="w-[22%] p-4 font-semibold text-neutral-900">
                  Topic
                </th>
                <th scope="col" className="w-[39%] p-4 font-semibold text-neutral-900">
                  Repairs helper
                </th>
                <th scope="col" className="w-[39%] p-4 font-semibold text-neutral-900">
                  RepairShopr (from its website)
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {ROWS.map((row) => (
                <tr key={row.topic} className="border-b border-neutral-100 align-top last:border-0 max-md:block max-md:px-1 max-md:py-3">
                  <th scope="row" className="p-4 font-medium text-neutral-900 max-md:block max-md:pb-1 max-md:text-[16px]">
                    {row.topic}
                  </th>
                  <td className="p-4 text-neutral-700 max-md:block max-md:py-1.5">
                    <span className="block text-[12px] font-semibold text-neutral-900 md:hidden">Repairs helper</span>
                    {row.ours}
                  </td>
                  <td className="p-4 text-neutral-700 max-md:block max-md:py-1.5">
                    <span className="block text-[12px] font-semibold text-neutral-900 md:hidden">RepairShopr</span>
                    {row.theirs}
                    <Source ids={row.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>

      <Band id="fit" title="When RepairShopr may suit you better">
        <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-neutral-700">
          <p>
            RepairShopr lists field jobs, mailed letters in the U.S., a customer map, localization and a large
            app center with integrations such as Slack, Google Calendar and PayPal. If your business depends on
            any of those, Repairs helper does not offer them today.
          </p>
          <p>
            Repairs helper is also in early access. One-click migration of repair history is not available, and
            Stripe, Square, email and SMS each need setting up and testing before customers rely on them.
          </p>
        </div>
      </Band>

      <Band id="different" tone="tray" title="What Repairs helper does differently">
        <PointGrid points={DIFFERENT} />
        <div className="mt-10 max-w-3xl">
          <Note title="Sources">
            <ul className="space-y-1.5">
              {Object.values(SOURCES).map((source) => (
                <li key={source.href}>
                  <a href={source.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    {source.label}
                  </a>{" "}
                  ({CHECKED})
                </li>
              ))}
            </ul>
            <p className="mt-3">
              Repairs helper details come from the product itself; see{" "}
              <Link href="/features" className="underline underline-offset-4">
                all features
              </Link>
              .
            </p>
          </Note>
        </div>
      </Band>

      <FaqSection faqs={FAQS} title="Switching questions" />
      <Related
        links={[
          PRICING_LINK,
          { href: "/features/point-of-sale", title: "Point of sale", body: "Card terminals, cash drawers, refunds and store credit at the repair counter." },
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
