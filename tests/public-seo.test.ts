import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getSession: async () => null }));
vi.mock("@/components/landing/repairs-home", () => ({
  RepairsHome: () => React.createElement("main", null, "Repair shop software"),
}));
vi.mock("@/components/ui/toaster", () => ({ AppToaster: () => null }));
import RootPage, { metadata } from "@/app/page";
import { metadata as defaults } from "@/app/layout";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PUBLIC_SITE_URL } from "@/lib/public-site";

describe("public search metadata", () => {
  it("describes the product and opts the homepage into search with a share image", () => {
    expect(metadata.title).toContain("Repair Shop Software");
    expect(metadata.description).toMatch(
      /repairs, sales, inventory and customer updates/,
    );
    expect(metadata.alternates).toEqual({ canonical: "/" });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(defaults.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "/",
      images: [
        {
          url: "/marketing/repair-shop-software-husky-og.png",
          width: 1200,
          height: 630,
        },
      ],
    });
  });
  it("renders parseable, truthful website structured data on the public root", async () => {
    const out = renderToStaticMarkup(await RootPage());
    const json = out.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(json).toBeTruthy();
    expect(JSON.parse(json!)).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "RepairsHelper",
      url: `${PUBLIC_SITE_URL}/`,
    });
  });
  it("describes browser software without inventing reviews or ratings", async () => {
    const out = renderToStaticMarkup(await RootPage());
    const schemas = [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
    expect(schemas[1]).toMatchObject({ "@type": "WebApplication", name: "RepairsHelper", applicationCategory: "BusinessApplication", operatingSystem: "Web browser" });
    expect(schemas[1].featureList).toContain("Mobile, tablet and desktop browser access");
    expect(schemas[1]).not.toHaveProperty("aggregateRating");
    expect(schemas[1]).not.toHaveProperty("review");
  });
  it("lists only public pages and allows the assets needed to render them", () => {
    const urls = sitemap().map((item) => item.url);
    expect(urls[0]).toBe(`${PUBLIC_SITE_URL}/`);
    for (const path of ["/pricing", "/features", "/contact", "/compare/repairshopr-alternative", "/privacy", "/terms"])
      expect(urls).toContain(`${PUBLIC_SITE_URL}${path}`);
    expect(new Set(urls).size).toBe(urls.length);
    expect(sitemap().every((item) => item.lastModified === undefined)).toBe(true);
    const rules = robots();
    expect(rules.sitemap).toBe(`${PUBLIC_SITE_URL}/sitemap.xml`);
    const disallow = (Array.isArray(rules.rules) ? rules.rules[0] : rules.rules).disallow as string[];
    expect(disallow).toContain("/api/");
    // Public pages, their images and opted-in shop pages must stay crawlable.
    for (const open of ["/pricing", "/features", "/s/", "/marketing/app/", "/shop-logo/", "/login", "/signup"])
      expect(disallow.some((rule) => !rule.endsWith("$") && open.startsWith(rule))).toBe(false);
  });
});
