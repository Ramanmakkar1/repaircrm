import Link from "next/link";

import { SHOTS } from "@/components/landing/media";
import {
  Band,
  ClosingCta,
  FaqSection,
  HeroActions,
  Note,
  PageHero,
  PointGrid,
  Related,
  Shot,
  Steps,
} from "@/components/marketing/parts";
import { COMPARE_LINK, PRICING_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, faqSchema, softwareSchema } from "@/lib/seo/schema";

export const metadata = pageMetadata({
  title: "Free Repair Shop Software, All Staff Included | Repairs helper",
  description:
    "Free repair shop software for phone, computer and electronics shops: tickets, POS, inventory, invoices and a customer portal. Free in early access, no card.",
  path: "/free-repair-shop-software",
});

const TRAIL = [{ name: "Free repair shop software", path: "/free-repair-shop-software" }];

const link = "underline underline-offset-4";

/** The same product facts as the feature pages, one line each. */
const INCLUDED = [
  {
    title: "Repair tickets",
    body: (
      <>
        Check-in with signature, status steps, due times by priority, parts on order, time and photos.{" "}
        <Link href="/features/repair-ticket-management" className={link}>
          Repair tickets
        </Link>
      </>
    ),
  },
  {
    title: "Estimates and invoices",
    body: (
      <>
        Estimates customers approve online, deposits, part payments, recurring invoices and statements.{" "}
        <Link href="/features/estimates-and-invoices" className={link}>
          Estimates and invoices
        </Link>
      </>
    ),
  },
  {
    title: "Point of sale",
    body: (
      <>
        Cash and card, Stripe Terminal or Square Terminal, any bank card machine, refunds, store credit and cash
        drawer counts.{" "}
        <Link href="/features/point-of-sale" className={link}>
          Point of sale
        </Link>
      </>
    ),
  },
  {
    title: "Inventory",
    body: (
      <>
        Low-stock levels, serial numbers, vendors, purchase orders, barcode labels and spreadsheet import.{" "}
        <Link href="/features/inventory-management" className={link}>
          Inventory
        </Link>
      </>
    ),
  },
  {
    title: "Customer portal and check-in",
    body: (
      <>
        Password-free repair status, estimate approval and online payment, a walk-in check-in desk and a shop page.{" "}
        <Link href="/features/customer-portal" className={link}>
          Customer portal
        </Link>
      </>
    ),
  },
  {
    title: "AI assistant",
    body: (
      <>
        Ask about repairs, stock and sales, summarise tickets and draft replies, within daily per-shop limits.{" "}
        <Link href="/features/ai-assistant" className={link}>
          AI assistant
        </Link>
      </>
    ),
  },
];

const COSTS = [
  {
    title: "Card processing",
    body: "Stripe or Square charge their own rates when you take card payments through them. Repairs helper adds no fee, and you can keep your bank's card machine and record payments by hand.",
  },
  {
    title: "Text messages",
    body: "SMS goes through your own Twilio account, and Twilio bills you directly.",
  },
  {
    title: "Email sending",
    body: "Emails to customers go through the email provider set up for your shop, which may charge for sending.",
  },
  {
    title: "Website enquiries",
    body: "Sending enquiries from a Splitforms form to your Leads page needs a paid Splitforms plan.",
  },
];

const START = [
  {
    title: "Create your shop",
    body: "Sign up with your shop's name, your name, an email address and a password. Nothing asks for a credit card.",
  },
  {
    title: "Add what you sell and fix",
    body: "Set up your device boxes and problem types, and import products from a spreadsheet or add them one at a time.",
  },
  {
    title: "Check in your first repair",
    body: "Find or add the customer, pick the device and the problem, record the details and sign.",
  },
  {
    title: "Invoice, take payment and hand over",
    body: "Invoice from the ticket, take cash or card, and mark the repair picked up.",
  },
];

const FAQS = [
  {
    q: "Is Repairs helper really free?",
    a: "Yes, during early access. Signing up creates your shop and owner account, and there is no billing anywhere in the product right now.",
  },
  {
    q: "What is the catch?",
    a: "Repairs helper is in early access. Paid plans will come later and will be announced well before anything changes. Some features, such as card payments, texts and email, need a provider account that may charge its own fees.",
  },
  {
    q: "Is there a limit on staff, locations or repairs?",
    a: "There are no feature tiers and no per-seat charges during early access. AI features have daily per-shop limits (400 text, 200 voice and 100 photo requests a day).",
  },
  {
    q: "What happens when early access ends?",
    a: "Paid plans have not been announced. They will be announced well before anything changes, and your data stays exportable the whole time.",
  },
  {
    q: "Can I take my data with me?",
    a: "Owners can export customers, invoices, payments and report data to CSV at any time. A complete archive of every record is not available yet.",
  },
];

export default function FreeRepairShopSoftwarePage() {
  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(TRAIL), softwareSchema(), faqSchema(FAQS)]} />
      <PageHero
        trail={TRAIL}
        eyebrow="Free during early access"
        title="Free repair shop software for your whole team"
        lede={
          <p>
            Repairs helper is free while it is in early access: every feature, every staff account and every
            location, with no credit card. This page sets out what that covers, what it does not, and what might
            still cost you money.
          </p>
        }
      >
        <HeroActions secondary={{ href: "/pricing", label: "See pricing details" }} />
      </PageHero>

      <div className="mx-auto w-full max-w-[1184px] px-5 pb-16 sm:px-8">
        <Shot
          shot={SHOTS.home}
          caption="The Home screen on a counter tablet, captured from the app with demo data: New repair and New sale, the Needs attention list and the main tools."
          priority
        />
      </div>

      <Band id="included" tone="tray" title="What you get for $0">
        <PointGrid points={INCLUDED} />
      </Band>

      <Band id="costs" title="What can still cost money">
        <PointGrid points={COSTS} />
        <div className="mt-12 max-w-3xl">
          <Note title="What “free” means here">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>No feature tiers and no per-seat charges during early access.</li>
              <li>AI requests have daily per-shop limits to keep the service fair for everyone.</li>
              <li>Paid plans have not been announced, and will be announced well before anything changes.</li>
            </ul>
          </Note>
        </div>
      </Band>

      <Band id="start" tone="tray" title="Start in four steps">
        <Steps steps={START} />
      </Band>

      <FaqSection faqs={FAQS} title="Questions about free" />
      <Related
        links={[
          PRICING_LINK,
          COMPARE_LINK,
          {
            href: "/guides/what-is-repair-shop-software",
            title: "What is repair shop software?",
            body: "What it does, how it is priced and a checklist for choosing one.",
          },
        ]}
      />
      <ClosingCta
        title="Start while it is free"
        body="Create your shop in a few minutes. No credit card needed."
      />
    </MarketingShell>
  );
}
