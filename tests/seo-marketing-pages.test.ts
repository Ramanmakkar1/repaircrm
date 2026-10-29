import { describe, expect, it } from "vitest";

import { FEATURE_PAGES } from "@/components/marketing/content/features";
import { SOFTWARE_PAGES } from "@/components/marketing/content/software";
import { PUBLIC_PATHS } from "@/lib/seo/pages";
import { breadcrumbSchema, faqSchema, organizationSchema, softwareSchema } from "@/lib/seo/schema";
import { PUBLIC_SITE_URL } from "@/lib/public-site";

describe("public marketing pages", () => {
  it("lists every feature and shop-type page in the sitemap paths, once", () => {
    for (const page of FEATURE_PAGES) expect(PUBLIC_PATHS).toContain(`/features/${page.slug}`);
    for (const page of SOFTWARE_PAGES) expect(PUBLIC_PATHS).toContain(`/software/${page.slug}`);
    expect(new Set(PUBLIC_PATHS).size).toBe(PUBLIC_PATHS.length);
  });

  it("gives every page a unique title and description of sensible length", () => {
    const pages = [...FEATURE_PAGES, ...SOFTWARE_PAGES];
    const titles = pages.map((p) => p.metaTitle);
    expect(new Set(titles).size).toBe(titles.length);
    for (const page of pages) {
      expect(page.metaTitle).toContain("Repairs helper");
      expect(page.metaDescription.length).toBeGreaterThan(70);
      expect(page.metaDescription.length).toBeLessThanOrEqual(160);
      expect(page.faqs.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("only links related cards to pages that exist", () => {
    const slugs = new Set(FEATURE_PAGES.map((p) => p.slug));
    for (const page of [...FEATURE_PAGES, ...SOFTWARE_PAGES])
      for (const slug of page.related) expect(slugs.has(slug)).toBe(true);
  });

  it("builds structured data without ratings and with the real offer", () => {
    const app = softwareSchema();
    expect(app).toMatchObject({ "@type": "WebApplication", name: "Repairs helper", applicationCategory: "BusinessApplication" });
    expect(app).toMatchObject({ offers: { "@type": "Offer", price: "0" } });
    expect(app).not.toHaveProperty("aggregateRating");
    expect(organizationSchema()).toMatchObject({
      "@type": "Organization",
      name: "Town Media Labs",
      contactPoint: { email: "support@repairshelper.com" },
    });
    expect(breadcrumbSchema([{ name: "Pricing", path: "/pricing" }])).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${PUBLIC_SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Pricing", item: `${PUBLIC_SITE_URL}/pricing` },
      ],
    });
    const faq = faqSchema([{ q: "Q?", a: "A." }]);
    expect(JSON.parse(JSON.stringify(faq))).toEqual(faq);
  });
});
