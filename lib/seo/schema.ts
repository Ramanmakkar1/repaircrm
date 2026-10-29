import { PUBLIC_SITE_URL } from "@/lib/public-site";

import { BRAND, OPERATOR, SUPPORT_EMAIL, absoluteUrl } from "./site";

/**
 * schema.org JSON-LD builders. Descriptive only: no ratings, reviews or user
 * counts, because none exist to cite. Every object is plain JSON so tests can
 * compare shapes and the <JsonLd> component can serialise it safely.
 */

type Json = Record<string, unknown>;

const ORG_ID = `${PUBLIC_SITE_URL}/#organization`;
const APP_ID = `${PUBLIC_SITE_URL}/#software`;

/** The operator of Repairs helper. */
export function organizationSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: OPERATOR.name,
    url: OPERATOR.url,
    logo: absoluteUrl("/icons/husky-512.png"),
    address: {
      "@type": "PostalAddress",
      addressLocality: OPERATOR.city,
      addressRegion: OPERATOR.region,
      addressCountry: OPERATOR.country,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SUPPORT_EMAIL,
      availableLanguage: "English",
    },
  };
}

/**
 * The product. The offer is the real one: $0 during early access, with no
 * card asked for (see components/landing/pricing.tsx). If paid plans arrive,
 * change this in the same commit as the pricing copy.
 */
export function softwareSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": APP_ID,
    name: BRAND,
    url: absoluteUrl("/"),
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Repair shop management software",
    operatingSystem: "Web browser",
    description:
      "Repair shop software for repair tickets, estimates, invoices, point of sale, inventory and customer updates, with an AI shop assistant.",
    featureList: [
      "Repair tickets with statuses, checklists and due-date targets",
      "Estimates with customer approval and signature",
      "Invoices, deposits, refunds and store credit",
      "Point of sale with Stripe Terminal and Square Terminal support",
      "Inventory with serial numbers, vendors and purchase orders",
      "Customer portal, public check-in and shop page",
      "Email and SMS notifications, campaigns and review requests",
      "QuickBooks Online and Xero sync",
      "REST API and webhooks",
      "AI ticket summaries, reply drafts and voice input",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CAD",
      description: "Free during early access. No credit card required.",
    },
    publisher: { "@id": ORG_ID },
  };
}

export type Crumb = { name: string; path: string };

/** BreadcrumbList for a subpage; Home is prepended. */
export function breadcrumbSchema(trail: Crumb[]): Json {
  const items = [{ name: "Home", path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export type Faq = { q: string; a: string };

/** FAQPage. Only use it on a page that shows these exact questions. */
export function faqSchema(faqs: readonly Faq[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}

/** WebSite for the home page, with the brand spelled exactly. */
export function websiteSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND,
    url: absoluteUrl("/"),
    publisher: { "@id": ORG_ID },
  };
}
