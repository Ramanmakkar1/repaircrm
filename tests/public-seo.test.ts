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
          url: "/marketing/repair-shop-software-og.png",
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
      name: "Repairs helper",
      url: `${PUBLIC_SITE_URL}/`,
    });
  });
  it("lists only public pages and allows the assets needed to render them", () => {
    expect(sitemap().map((item) => item.url)).toEqual([
      `${PUBLIC_SITE_URL}/`,
      `${PUBLIC_SITE_URL}/privacy`,
      `${PUBLIC_SITE_URL}/terms`,
    ]);
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
    });
  });
});
