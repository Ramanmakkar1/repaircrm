import { Pricing } from "@/components/landing/pricing";
import {
  Band,
  ClosingCta,
  FaqSection,
  PageHero,
  PointGrid,
  Related,
} from "@/components/marketing/parts";
import { COMPARE_LINK, CONTACT_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, faqSchema, softwareSchema } from "@/lib/seo/schema";

export const metadata = pageMetadata({
  title: "Repair Shop Software Pricing: Free in Early Access | Repairs helper",
  description:
    "Repairs helper is free during early access: no tiers, no per-seat fees, no credit card. See what is included and which third-party fees can apply.",
  path: "/pricing",
});

const TRAIL = [{ name: "Pricing", path: "/pricing" }];

const FAQS = [
  {
    q: "Is Repairs helper really free?",
    a: "Yes, during early access. Signing up creates your shop and owner account, and there is no billing anywhere in the product right now.",
  },
  {
    q: "Do I need a credit card to sign up?",
    a: "No. Nothing in Repairs helper asks for a card.",
  },
  {
    q: "Is there a limit on staff or repairs?",
    a: "There are no feature tiers and no per-seat charges during early access. AI features have daily per-shop limits (400 text, 200 voice and 100 photo requests a day) to keep the service fair for everyone.",
  },
  {
    q: "What will it cost after early access?",
    a: "Paid plans have not been announced. They will be announced well before anything changes, and your data stays exportable the whole time.",
  },
  {
    q: "What could I pay for while it is free?",
    a: "Services you connect may charge you directly: Stripe or Square for card processing, Twilio for text messages, and your email provider. Splitforms webhooks for website enquiries need a paid Splitforms plan.",
  },
  {
    q: "Can I take my data with me?",
    a: "Owners can export customers, invoices, payments and report data to CSV at any time. A complete archive of every record is not available yet.",
  },
];

const CHECKS = [
  {
    title: "Count your seats",
    body: "Many repair shop tools price by user or location. Here every staff account is included during early access, with owner, technician and front-desk roles.",
  },
  {
    title: "Price your card processing",
    body: "Repairs helper does not add a fee to card payments. Your processor (Stripe or Square) charges its own rates, or you keep your bank's terminal and record payments manually.",
  },
  {
    title: "Price your messages",
    body: "Text messages are billed by your SMS provider. Email sending depends on the provider set up for your shop.",
  },
  {
    title: "Check what you need on day one",
    body: "Stripe, Square, email and SMS all need setup and a test before customers rely on them. The counter, tickets, stock and reports work straight away.",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(TRAIL), softwareSchema(), faqSchema(FAQS)]} />
      <PageHero
        trail={TRAIL}
        eyebrow="Pricing"
        title="Repair shop software pricing"
        lede={
          <p>
            One plan, and it costs nothing while Repairs helper is in early access. Below is exactly what is
            included, what is not finished yet, and the third-party costs you might still have.
          </p>
        }
      />

      <Pricing />

      <Band id="costs" tone="tray" title="Working out what your shop will actually spend">
        <PointGrid points={CHECKS} />
      </Band>

      <FaqSection faqs={FAQS} title="Pricing questions" />
      <Related links={[COMPARE_LINK, CONTACT_LINK, { href: "/features", title: "All features", body: "Every part of the app, with what each one needs before you rely on it." }]} />
      <ClosingCta
        title="Start while it is free"
        body="Create your shop in a few minutes. No credit card needed."
      />
    </MarketingShell>
  );
}
