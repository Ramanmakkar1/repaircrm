import Link from "next/link";
import { Mail } from "lucide-react";

import { Band, ClosingCta, FaqSection, PageHero, Related } from "@/components/marketing/parts";
import { COMPARE_LINK, PRICING_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, faqSchema, organizationSchema } from "@/lib/seo/schema";
import { OPERATOR, SUPPORT_EMAIL } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Contact Repairs helper | Support for Repair Shop Software",
  description:
    "Email support@repairshelper.com about Repairs helper, your shop's account, privacy or security. Operated by Town Media Labs in Edmonton, Canada.",
  path: "/contact",
});

const TRAIL = [{ name: "Contact", path: "/contact" }];

const ROUTES = [
  {
    title: "Thinking about signing up",
    body: "Ask whether Repairs helper fits your shop, how a workflow works, or what is planned. Tell us what kind of repairs you do and what you use today.",
    action: { href: `mailto:${SUPPORT_EMAIL}?subject=Question%20before%20signing%20up`, label: SUPPORT_EMAIL },
  },
  {
    title: "Help with your shop's account",
    body: "Sign-in trouble, setting up payments or messages, importing data. Include your shop name and the email you sign in with, never your password.",
    action: { href: `mailto:${SUPPORT_EMAIL}?subject=Help%20with%20my%20shop`, label: SUPPORT_EMAIL },
  },
  {
    title: "A bug or a feature request",
    body: "The feedback form sends your report to the people who build Repairs helper. Say what you expected and what happened instead.",
    action: { href: "/feedback", label: "Report an issue or idea" },
  },
  {
    title: "Privacy and security",
    body: "Questions about your data, a data request, or a security concern. Read the privacy policy for how information is handled.",
    action: { href: `mailto:${SUPPORT_EMAIL}?subject=Privacy%20or%20security`, label: SUPPORT_EMAIL },
  },
];

const FAQS = [
  {
    q: "I am waiting for my phone or computer. Who do I contact?",
    a: "Your repair shop. Repairs helper is the software shops use; we cannot see or change your repair. If your shop uses the customer portal, you can also check your repair there.",
  },
  {
    q: "Is there phone support?",
    a: "Support is by email at support@repairshelper.com during early access.",
  },
  {
    q: "Who runs Repairs helper?",
    a: "Town Media Labs, based in Edmonton, Alberta, Canada.",
  },
];

export default function ContactPage() {
  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(TRAIL), organizationSchema(), faqSchema(FAQS)]} />
      <PageHero
        trail={TRAIL}
        eyebrow="Contact"
        title="Contact Repairs helper"
        lede={
          <p>
            Email is the fastest way to reach us. Write to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-(--site-accent-ink) underline underline-offset-4">
              {SUPPORT_EMAIL}
            </a>{" "}
            and we will reply by email.
          </p>
        }
      />

      <Band id="routes" tone="tray" title="What can we help with?">
        <ul className="grid gap-4 md:grid-cols-2">
          {ROUTES.map((route) => (
            <li key={route.title} className="flex flex-col rounded-2xl bg-white p-6">
              <h3 className="text-[19px] font-semibold tracking-tight text-neutral-900">{route.title}</h3>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-neutral-700">{route.body}</p>
              {route.action.href.startsWith("mailto:") ? (
                <a href={route.action.href} className="site-text-link mt-4 break-all">
                  <Mail size={17} aria-hidden="true" /> {route.action.label}
                </a>
              ) : (
                <Link href={route.action.href} className="site-text-link mt-4">
                  {route.action.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Band>

      <Band id="operator" title="Who you are writing to">
        <div className="grid gap-8 md:grid-cols-2">
          <address className="not-italic text-[15px] leading-relaxed text-neutral-700">
            <span className="block text-[17px] font-semibold text-neutral-900">{OPERATOR.name}</span>
            Operator of Repairs helper
            <br />
            {OPERATOR.city}, {OPERATOR.region}, Canada
            <br />
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
              {SUPPORT_EMAIL}
            </a>
          </address>
          <p className="text-[15px] leading-relaxed text-neutral-700">
            Repairs helper is governed by the{" "}
            <Link href="/terms" className="underline underline-offset-4">
              terms of service
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              privacy policy
            </Link>
            . Customers of a repair shop should contact that shop about their repair.
          </p>
        </div>
      </Band>

      <FaqSection faqs={FAQS} title="Before you write" />
      <Related links={[PRICING_LINK, COMPARE_LINK, { href: "/features", title: "All features", body: "How each part of the app works, and what it needs before you rely on it." }]} />
      <ClosingCta title="Or just try it" body="Create a shop and look around. It is free during early access and needs no card." />
    </MarketingShell>
  );
}
